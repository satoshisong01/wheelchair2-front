//  app/api/admin/devices/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { query, default as pool } from '@/lib/db';
import bcrypt from 'bcrypt';
import { createAuditLog } from '@/lib/log'; // ⭐️ 감사 로그 임포트

// ------------------------------
// GET: 휠체어/기기 목록 조회 (ADMIN/MASTER 전용)
// ------------------------------
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  // @ts-ignore
  if (
    !session ||
    (session.user.role !== 'MASTER' && session.user.role !== 'ADMIN')
  ) {
    return NextResponse.json(
      { message: '접근 권한이 없습니다.' },
      { status: 403 }
    );
  }

  try {
    // ⭐️ SQL FIX: registrant_user_id를 기준으로 users 테이블을 조인하여 등록자 이름을 가져옵니다.
    const sql = `
            SELECT 
                w.id, w.device_serial, w.model_name, w.status, w.created_at,
                d.device_id,
                u.name AS registered_by_name, 
                u.email AS registered_by_email
            FROM wheelchairs w
            LEFT JOIN device_auths d ON w.id = d.wheelchair_id
            LEFT JOIN users u ON w.registrant_user_id = u.id -- ⭐️ 등록자 FK 사용
            ORDER BY w.created_at DESC
        `;
    const result = await query(sql);

    // Raw SQL 결과는 snake_case이며, UI에서 요구하는 registered_by_name 등을 포함합니다.
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching device list:', error);
    return NextResponse.json(
      { message: '장치 목록을 불러오는 데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// ------------------------------
// POST: 새 휠체어/기기 등록 (ADMIN/MASTER 전용)
// ------------------------------
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  // @ts-ignore
  const userId = session?.user?.id; // 현재 로그인된 관리자 ID
  // @ts-ignore
  const userRole = session?.user?.role;

  // @ts-ignore
  if (!session || (userRole !== 'MASTER' && userRole !== 'ADMIN')) {
    return NextResponse.json(
      { message: '접근 권한이 없습니다.' },
      { status: 403 }
    );
  }

  const { deviceSerial, deviceId, password, modelName } = await req.json();

  if (!deviceSerial || !deviceId || !password) {
    return NextResponse.json(
      { message: '필수 필드가 누락되었습니다.' },
      { status: 400 }
    );
  }

  // 비밀번호 해시
  const hashedPassword = await bcrypt.hash(password, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // 트랜잭션 시작

    // 1. Wheelchair 테이블에 새 장치 정보 및 등록자 ID 삽입
    const insertWheelchairSql = `
            INSERT INTO wheelchairs (device_serial, model_name, registrant_user_id)
            VALUES ($1, $2, $3)
            RETURNING id;
        `;
    const wheelchairResult = await client.query(insertWheelchairSql, [
      deviceSerial,
      modelName || null,
      userId,
    ]);
    const wheelchairId = wheelchairResult.rows[0].id;

    // 2. DeviceAuth 테이블에 로그인 정보 삽입
    const insertDeviceAuthSql = `
            INSERT INTO device_auths (device_id, password, wheelchair_id)
            VALUES ($1, $2, $3);
        `;
    await client.query(insertDeviceAuthSql, [
      deviceId,
      hashedPassword,
      wheelchairId,
    ]);

    // 3. User-Wheelchair 연결 테이블에도 현재 유저 연결 (N:M 관계)
    const insertUserWheelchairSql = `
            INSERT INTO user_wheelchairs (user_id, wheelchair_id)
            VALUES ($1, $2);
        `;
    await client.query(insertUserWheelchairSql, [userId, wheelchairId]);

    await client.query('COMMIT'); // 트랜잭션 종료 및 저장

    // ⭐️ [LOG INJECTION] 기기 생성 로그 기록
    createAuditLog({
      userId: userId,
      userRole: userRole,
      action: 'DEVICE_REGISTER',
      details: { serial: deviceSerial, wcId: wheelchairId, model: modelName },
    });

    return NextResponse.json({
      message: '장치 및 계정이 성공적으로 등록되었습니다.',
    });
  } catch (error: any) {
    await client.query('ROLLBACK'); // 오류 발생 시 롤백

    if (error.code === '23505') {
      // PostgreSQL unique violation code
      return NextResponse.json(
        { message: '이미 존재하는 시리얼 번호 또는 기기 ID입니다.' },
        { status: 409 }
      );
    }
    console.error('Device registration failed:', error);
    return NextResponse.json(
      { message: '장치 등록에 실패했습니다.' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// ------------------------------
// DELETE: 휠체어/기기 삭제 (MASTER 전용)
// ------------------------------
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions); // @ts-ignore
  const userRole = session?.user?.role; // @ts-ignore
  const userId = session?.user?.id; // @ts-ignore

  if (!session || (userRole !== 'MASTER' && userRole !== 'ADMIN')) {
    // MASTER만 삭제 권한을 갖는다고 가정
    return NextResponse.json(
      { message: '접근 권한이 없습니다.' },
      { status: 403 }
    );
  }

  const { wheelchairId } = await req.json();

  if (!wheelchairId) {
    return NextResponse.json(
      { message: '휠체어 ID가 필요합니다.' },
      { status: 400 }
    );
  } // ⭐️ [핵심 수정 1] 삭제 전에 시리얼 번호와 모델명 조회

  let serial = 'N/A';
  let model = 'N/A';
  try {
    const lookupSql = `SELECT device_serial, model_name FROM wheelchairs WHERE id = $1`;
    const lookupResult = await query(lookupSql, [wheelchairId]);
    if (lookupResult.rowCount > 0) {
      serial = lookupResult.rows[0].device_serial;
      model = lookupResult.rows[0].model_name;
    } else {
      return NextResponse.json(
        { message: '해당 휠체어를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }
  } catch (e) {
    console.error('Serial lookup failed before delete:', e); // 로그는 기록하지 않고 삭제 진행 (혹은 500 에러 반환)
  } // Wheelchair를 삭제하면 CASCADE 옵션으로 device_auths 및 user_wheelchairs 관계도 자동으로 삭제됨

  try {
    const deleteSql = `DELETE FROM wheelchairs WHERE id = $1;`;
    const result = await query(deleteSql, [wheelchairId]);

    if (result.rowCount === 0) {
      return NextResponse.json(
        { message: '해당 휠체어를 찾을 수 없습니다.' },
        { status: 404 }
      );
    } // ⭐️ [핵심 수정 2] 시리얼과 모델 정보를 details에 포함하여 기록

    createAuditLog({
      userId: userId,
      userRole: userRole,
      action: 'DEVICE_DELETE',
      details: { wheelchairId: wheelchairId, serial: serial, model: model }, // ⭐️ 상세 정보 추가
    });

    return NextResponse.json({
      message: `장치 (${serial})가 성공적으로 삭제되었습니다.`,
    });
  } catch (error) {
    console.error('Device deletion failed:', error); // 삭제 실패 시에도 로그는 기록하지 않음 (선택 사항)
    return NextResponse.json(
      { message: '장치 삭제에 실패했습니다.' },
      { status: 500 }
    );
  }
}
