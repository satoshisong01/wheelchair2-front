import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth'; // 세션 필수
import { authOptions } from '@/lib/authOptions';
import pgPool from '@/lib/db';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/validate';
import { createAuditLog } from '@/lib/log';
import { logServerError } from '@/lib/server-log';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    // 🔒 [인가] 기기 사용자 본인 알림 설정만 변경 가능
    if (session.user.role !== 'DEVICE_USER') {
      return NextResponse.json({ message: '접근 권한이 없습니다.' }, { status: 403 });
    }

    // 🟢 Body에서 데이터 받기 (body의 wheelchairId는 무시하고 세션 값을 사용)
    const parsed = await parseJsonBody(
      req,
      z.object({
        type: z.string().max(50).optional(),
        enabled: z.boolean(),
      }),
    );
    if ('error' in parsed) return parsed.error;
    const { type, enabled } = parsed.data;

    // 🔒 [보안] 대상 기기·계정은 서버 세션 값(로그인 시 device_auths에서 설정)으로만 결정
    const userId = session.user.id;
    const wheelchairId = session.user.wheelchairId;

    const columnMap: { [key: string]: string } = {
      emergency: 'push_emergency',
      battery: 'push_battery',
      posture: 'push_posture',
    };

    // 🔒 프로토타입 키(constructor 등)가 컬럼명으로 쓰이지 않게 자기 속성만 허용
    const columnName = type && Object.hasOwn(columnMap, type) ? columnMap[type] : undefined;
    if (!columnName) return NextResponse.json({ message: 'Invalid type' }, { status: 400 });

    // 🟢 device_auths 테이블 업데이트 (나의 설정만 변경)
    // 조건: 휠체어 ID + 내 사용자 ID
    const query = `
      UPDATE device_auths 
      SET ${columnName} = $1 
      WHERE wheelchair_id = $2 AND id = $3
    `;

    // ⚠️ 주의: 'id' 컬럼이 사용자 식별자가 맞는지 확인하세요.
    // 만약 device_auths 테이블에 user_email 등이 있다면 그걸 써야 합니다.
    const result = await pgPool.query(query, [enabled, wheelchairId, userId]);
    if (result.rowCount === 0) {
      return NextResponse.json({ message: '기기 계정을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 🔒 [감사] 기기 사용자 알림 설정 변경 기록 (관리자 토글과 같은 액션·형식)
    await createAuditLog({
      userId,
      userRole: session.user.role,
      action: 'DEVICE_NOTIFICATION_TOGGLE',
      details: { wheelchairId, type, enabled },
      deviceSerial: session.user.deviceId,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    // 🔒 [보안] 내부 에러 상세는 서버 로그에만, 클라이언트에는 일반 메시지만 노출
    logServerError('[API /user/settings] Error', error);
    return NextResponse.json({ message: '설정 저장에 실패했습니다.' }, { status: 500 });
  }
}
