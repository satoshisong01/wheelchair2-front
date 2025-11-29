// app/api/admin/devices/[id]/route.ts
// 📝 설명: TypeORM 제거, Raw SQL 적용, UUID(string) 사용

import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getServerSession } from 'next-auth';
// 🚨 authOptions 경로가 프로젝트마다 다를 수 있으니 확인해주세요 (lib/auth 또는 app/api/auth/[...nextauth]/route)
import { authOptions } from '@/lib/authOptions';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // RDS 연결용
});

// Next.js 15+ 대응: params를 Promise로 정의
interface RouteParams {
  params: Promise<{ id: string }>;
}

// 1. 상세 조회 (GET)
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (
      !session ||
      (session.user.role !== 'ADMIN' && session.user.role !== 'MASTER')
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params; // 🚨 await 필수

    // 기기 정보 + 인증 정보 조인 조회
    const query = `
      SELECT 
        w.id, w.device_serial, w.model_name, w.created_at,
        da.auth_code, da.is_verified, da.verified_at
      FROM wheelchairs w
      LEFT JOIN device_auths da ON w.id = da.wheelchair_id
      WHERE w.id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // 카멜케이스 변환 (프론트엔드 호환성)
    const row = result.rows[0];
    const responseData = {
      id: row.id,
      deviceSerial: row.device_serial,
      modelName: row.model_name,
      createdAt: row.created_at,
      deviceAuth: {
        authCode: row.auth_code,
        isVerified: row.is_verified,
        verifiedAt: row.verified_at,
      },
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Device Detail Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// 2. 수정 (PATCH)
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (
      !session ||
      (session.user.role !== 'ADMIN' && session.user.role !== 'MASTER')
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { modelName, deviceSerial } = body;

    // 업데이트 쿼리
    const query = `
      UPDATE wheelchairs 
      SET model_name = COALESCE($1, model_name), 
          device_serial = COALESCE($2, device_serial)
      WHERE id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [modelName, deviceSerial, id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // 감사 로그 (필요시 활성화)
    // await pool.query('INSERT INTO admin_audit_logs ...');

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Device Update Error:', error);
    return NextResponse.json({ error: 'Update Failed' }, { status: 500 });
  }
}

// 3. 삭제 (DELETE)
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (
      !session ||
      (session.user.role !== 'ADMIN' && session.user.role !== 'MASTER')
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // 🚨 UUID 사용하므로 parseInt 절대 금지! 그대로 사용합니다.

    // 삭제 쿼리 (Cascade 설정되어 있으면 관련 데이터도 삭제됨)
    const result = await pool.query('DELETE FROM wheelchairs WHERE id = $1', [
      id,
    ]);

    if (result.rowCount === 0) {
      return NextResponse.json(
        { message: '삭제할 기기를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log(`[Admin] Device Deleted: ${id} by ${session.user.email}`);

    return NextResponse.json({ message: '기기가 성공적으로 삭제되었습니다.' });
  } catch (error) {
    console.error('Device Delete Error:', error);
    return NextResponse.json({ error: 'Delete Failed' }, { status: 500 });
  }
}
