// app/api/admin/devices/[id]/route.ts
// 📝 설명: GET, PATCH, DELETE 모든 기능을 포함하며 TypeORM 제거 및 Raw SQL 적용 완료

import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getServerSession } from 'next-auth';
// 🚨 authOptions 경로 확인 필수
import { authOptions } from '@/lib/authOptions'; 

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, 
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 1. 상세 조회 (GET)
export async function GET(
  request: Request,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MASTER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    
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
        verifiedAt: row.verified_at
      },
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Device Detail Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// 2. 수정 (PATCH)
export async function PATCH(
  request: Request,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MASTER')) {
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

    // 감사 로그는 간단히 콘솔에 출력
    console.log(`[AdminAudit] Device Updated: ${id} by ${session.user.email}`);

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Device Update Error:', error);
    return NextResponse.json({ error: 'Update Failed' }, { status: 500 });
  }
}

// 3. 삭제 (DELETE)
export async function DELETE(
  request: Request,
  { params }: RouteParams
) {
  const client = await pool.connect(); // 트랜잭션을 위해 클라이언트 연결
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MASTER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const adminUserId = session.user.dbUserId;
    const adminEmail = session.user.email;
    
    await client.query('BEGIN'); // 트랜잭션 시작

    // ⭐️ [핵심 FIX 1] 삭제 전에 시리얼 번호 조회
    const serialLookupQuery = `
      SELECT device_serial, model_name 
      FROM wheelchairs 
      WHERE id = $1
    `;
    const lookupResult = await client.query(serialLookupQuery, [id]);
    
    if (lookupResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ message: '삭제할 기기를 찾을 수 없습니다.' }, { status: 404 });
    }

    const serial = lookupResult.rows[0].device_serial;
    const model = lookupResult.rows[0].model_name;

    // ⭐️ [핵심 FIX 2] 감사 로그 기록 (JSON 형태로 시리얼 포함)
    const logDetails = JSON.stringify({
      wheelchair_id: id,
      serial: serial,
      model: model,
      adminEmail: adminEmail,
    });
    
    const logQuery = `
      INSERT INTO admin_audit_logs (action_type, details, admin_user_id, created_at)
      VALUES ($1, $2, $3, NOW())
    `;
    await client.query(logQuery, ['DEVICE_DELETE', logDetails, adminUserId]);

    // 3. 휠체어 삭제
    await client.query('DELETE FROM wheelchairs WHERE id = $1', [id]);

    await client.query('COMMIT'); // 커밋

    console.log(`[Admin] Device Deleted: ${serial} by ${adminEmail}`);

    return NextResponse.json({ message: `기기 (${serial})가 성공적으로 삭제되었습니다.` });

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Device Delete Error:', error);
    return NextResponse.json({ error: 'Delete Failed' }, { status: 500 });
  } finally {
    client.release(); // 연결 해제
  }
}