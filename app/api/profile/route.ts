// app/api/profile/route.ts
// 📝 설명: TypeORM 제거, Raw SQL 트랜잭션 적용, 유저+의료+휠체어 통합 업데이트

import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { encryptMedicalInfo } from '@/lib/crypto'; // lib/crypto.ts 수정 필수 (emergencyContact)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// 1. GET: 프로필 조회 (기존 로직 유지)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.dbUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.dbUserId;

    // users 테이블에서 내 정보 조회
    const query = `
      SELECT id, email, nickname, role, created_at, location1, location2
      FROM users 
      WHERE id = $1
    `;
    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = result.rows[0];
    return NextResponse.json({
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      location1: user.location1,
      location2: user.location2,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error('[API /profile] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// 2. POST: 프로필 + 의료정보 + 휠체어 통합 등록/수정 (트랜잭션 적용)
export async function POST(request: Request) {
  const client = await pool.connect(); // 트랜잭션을 위해 클라이언트 연결

  try {
    // 1. 세션 확인
    const session = await getServerSession(authOptions);
    if (!session?.user?.dbUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.dbUserId;

    // 2. 요청 데이터 파싱
    const body = await request.json();
    const {
      nickname,
      location1, // 시/도
      location2, // 시/군/구
      deviceSerial,
      modelName,
      purchaseDate,
      disabilityGrade,
      medicalConditions,
      emergencyContact, // (추가 필드)
    } = body;

    // 3. 필수 값 검증
    if (!nickname || !deviceSerial || !disabilityGrade || !medicalConditions) {
      return NextResponse.json(
        { error: '필수 입력값이 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 4. 트랜잭션 시작
    await client.query('BEGIN');

    // -------------------------------------------------------------
    // (A) User 정보 업데이트
    // -------------------------------------------------------------
    const updateUserQuery = `
      UPDATE users 
      SET nickname = $1, location1 = $2, location2 = $3
      WHERE id = $4
    `;
    await client.query(updateUserQuery, [
      nickname,
      location1 || null,
      location2 || null,
      userId,
    ]);

    // -------------------------------------------------------------
    // (B) MedicalInfo 업데이트 (Upsert)
    // -------------------------------------------------------------
    const encryptedData = encryptMedicalInfo({
      disabilityGrade,
      medicalConditions,
      emergencyContact,
    });

    const upsertMedicalQuery = `
      INSERT INTO medical_info (
        user_id, disability_grade, medical_conditions, emergency_contact, updated_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        disability_grade = $2, 
        medical_conditions = $3,
        emergency_contact = $4,
        updated_at = NOW()
    `;
    await client.query(upsertMedicalQuery, [
      userId,
      encryptedData.disabilityGrade,
      encryptedData.medicalConditions,
      encryptedData.emergencyContact || null,
    ]);

    // -------------------------------------------------------------
    // (C) 휠체어 등록 및 연결 (UserWheelchair 매핑)
    // -------------------------------------------------------------

    // C-1. 휠체어 찾기 (없으면 생성, 있으면 업데이트)
    // UUID 자동 생성을 위해 gen_random_uuid() 사용
    let wheelchairId = null;

    // 시리얼로 조회
    const findWcQuery = 'SELECT id FROM wheelchairs WHERE device_serial = $1';
    const wcResult = await client.query(findWcQuery, [deviceSerial]);

    if (wcResult.rows.length > 0) {
      // 이미 존재하는 기기 -> 정보 업데이트
      wheelchairId = wcResult.rows[0].id;
      const updateWcQuery = `
        UPDATE wheelchairs 
        SET model_name = COALESCE($1, model_name), 
            purchase_date = COALESCE($2, purchase_date)
        WHERE id = $3
      `;
      await client.query(updateWcQuery, [
        modelName,
        purchaseDate ? new Date(purchaseDate) : null,
        wheelchairId,
      ]);
      console.log(`[API /profile] 기존 휠체어 업데이트: ${deviceSerial}`);
    } else {
      // 새 기기 -> 생성
      const insertWcQuery = `
        INSERT INTO wheelchairs (id, device_serial, model_name, purchase_date, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, NOW())
        RETURNING id
      `;
      const insertResult = await client.query(insertWcQuery, [
        deviceSerial,
        modelName || null,
        purchaseDate ? new Date(purchaseDate) : null,
      ]);
      wheelchairId = insertResult.rows[0].id;
      console.log(`[API /profile] 새 휠체어 생성: ${deviceSerial}`);
    }

    // C-2. 유저-휠체어 연결 (user_wheelchair 테이블)
    // (기존 N:M 관계 유지)
    // 중복 연결 방지를 위해 ON CONFLICT DO NOTHING 사용
    const linkQuery = `
      INSERT INTO user_wheelchair (user_id, wheelchair_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, wheelchair_id) DO NOTHING
    `;
    await client.query(linkQuery, [userId, wheelchairId]);

    // 5. 트랜잭션 커밋
    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    // 에러 발생 시 롤백
    await client.query('ROLLBACK');

    let errorMessage = 'Internal Server Error';
    if (error.code === '23505') {
      // Unique constraint violation code
      errorMessage = '이미 등록된 시리얼 번호입니다.';
    } else {
      errorMessage = error.message;
    }

    console.error('[API /profile] POST Error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  } finally {
    client.release(); // 연결 해제
  }
}
