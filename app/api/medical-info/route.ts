// app/api/medical-info/route.ts
// 📝 설명: TypeORM 제거, Raw SQL 적용, 암호화/복호화 로직 유지

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { Pool } from 'pg';

// 1. 인증 및 암호화 헬퍼 임포트
import { authOptions } from '@/lib/authOptions';
import { encryptMedicalInfo, decryptMedicalInfo } from '@/lib/crypto';

// 2. DB 연결 설정
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // RDS 연결 필수
});

/**
 * [GET] 의료 정보 조회 (복호화 반환)
 */
export async function GET(request: Request) {
  try {
    // 1. 사용자 인증
    const session = await getServerSession(authOptions);
    if (!session?.user?.dbUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.dbUserId;

    // 2. DB 조회 (Raw SQL)
    // DB 컬럼(snake_case)을 가져옵니다.
    const query = `
      SELECT disability_grade, medical_conditions, emergency_contact, created_at
      FROM medical_info
      WHERE user_id = $1
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return NextResponse.json(null);
    }

    const row = result.rows[0];

    // 3. 복호화를 위해 엔티티 형태(camelCase)로 매핑
    // (decryptMedicalInfo 함수가 객체의 속성을 읽어서 복호화한다고 가정)
    const encryptedObject = {
      disabilityGrade: row.disability_grade,
      medicalConditions: row.medical_conditions,
      emergencyContact: row.emergency_contact,
    };

    // 4. 복호화 수행
    // (기존 헬퍼 함수가 Partial<MedicalInfo> 형태를 받는다면 호환됩니다)
    const decryptedData = decryptMedicalInfo(encryptedObject as any);

    return NextResponse.json(decryptedData);
  } catch (error: unknown) {
    let errorMessage = 'Internal Server Error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error('[API /medical-info] GET Error:', errorMessage, error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

/**
 * [POST] 의료 정보 저장 (암호화 저장)
 */
export async function POST(request: Request) {
  try {
    // 1. 사용자 인증
    const session = await getServerSession(authOptions);
    if (!session?.user?.dbUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.dbUserId;

    // 2. 요청 데이터 파싱
    const body = await request.json();
    const { disabilityGrade, medicalConditions, emergencyContact } = body;

    // 유효성 검사
    if (!disabilityGrade || !medicalConditions) {
      return NextResponse.json(
        { error: '장애 등급과 특이사항은 필수입니다. "없음"을 입력해주세요.' },
        { status: 400 }
      );
    }

    // 3. 데이터 암호화
    const encryptedData = encryptMedicalInfo({
      disabilityGrade,
      medicalConditions,
      emergencyContact, // 있는 경우 함께 암호화
    });

    // 4. DB 저장 (Upsert: 없으면 생성, 있으면 수정)
    // ON CONFLICT (user_id) 구문 사용
    const query = `
      INSERT INTO medical_info (
        user_id, 
        disability_grade, 
        medical_conditions, 
        emergency_contact, 
        created_at, 
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        disability_grade = $2, 
        medical_conditions = $3,
        emergency_contact = $4,
        updated_at = NOW()
      RETURNING *
    `;

    await pool.query(query, [
      userId,
      encryptedData.disabilityGrade,
      encryptedData.medicalConditions,
      encryptedData.emergencyContact || null, // 없을 경우 null
    ]);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    let errorMessage = 'Internal Server Error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error('[API /medical-info] POST Error:', errorMessage, error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
