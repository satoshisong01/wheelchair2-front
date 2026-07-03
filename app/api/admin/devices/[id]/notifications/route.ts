// 관리자용 휠체어 알림 설정 토글 API
// PATCH /api/admin/devices/[id]/notifications
// body: { type: 'emergency' | 'battery' | 'posture', enabled: boolean }

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { Pool } from 'pg';
import { createAuditLog } from '@/lib/log';
import { getDbSslOption } from '@/lib/db';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: getDbSslOption(),
});

type NotificationType = 'emergency' | 'battery' | 'posture';

const COLUMN_MAP: Record<NotificationType, string> = {
  emergency: 'push_emergency',
  battery: 'push_battery',
  posture: 'push_posture',
};

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  // @ts-ignore
  const role = session?.user?.role;
  // @ts-ignore
  const adminUserId = session?.user?.id;

  if (!session || (role !== 'ADMIN' && role !== 'MASTER')) {
    return NextResponse.json(
      { message: '접근 권한이 없습니다.' },
      { status: 403 }
    );
  }

  const { id: wheelchairId } = await params;

  if (!wheelchairId) {
    return NextResponse.json(
      { message: '휠체어 ID가 필요합니다.' },
      { status: 400 }
    );
  }

  let body: { type?: NotificationType; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: '잘못된 요청 형식입니다.' },
      { status: 400 }
    );
  }

  const { type, enabled } = body;

  if (!type || !(type in COLUMN_MAP) || typeof enabled !== 'boolean') {
    return NextResponse.json(
      { message: 'type 또는 enabled 값이 올바르지 않습니다.' },
      { status: 400 }
    );
  }

  const column = COLUMN_MAP[type];

  try {
    const updateSql = `
      UPDATE device_auths
      SET ${column} = $1
      WHERE wheelchair_id = $2
      RETURNING push_emergency, push_battery, push_posture
    `;
    const result = await pool.query(updateSql, [enabled, wheelchairId]);

    if (result.rowCount === 0) {
      return NextResponse.json(
        { message: '해당 휠체어의 기기 계정을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 감사 로그 (실패해도 응답은 성공)
    createAuditLog({
      userId: adminUserId,
      userRole: role,
      action: 'DEVICE_NOTIFICATION_TOGGLE',
      details: { wheelchairId, type, enabled },
    });

    return NextResponse.json({
      success: true,
      settings: {
        emergency: result.rows[0].push_emergency,
        battery: result.rows[0].push_battery,
        posture: result.rows[0].push_posture,
      },
    });
  } catch (error) {
    console.error('[Admin notification toggle] Error:', error);
    return NextResponse.json(
      { message: '알림 설정 변경에 실패했습니다.' },
      { status: 500 }
    );
  }
}
