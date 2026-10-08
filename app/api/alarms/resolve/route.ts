import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import pool from '@/lib/db';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/validate';
import { createAuditLog } from '@/lib/log';
import { logServerError } from '@/lib/server-log';

// 🔒 [입력검증] 알람 ID는 UUID(현행) 또는 정수만 허용
const ALARM_ID_REGEX =
  /^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|\d{1,18})$/i;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user)
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const parsed = await parseJsonBody(
      req,
      z
        .object({
          alarmId: z.union([z.string().regex(ALARM_ID_REGEX), z.number().int().positive()]).optional(),
          all: z.boolean().optional(),
          resolvePostureAdvice: z.boolean().optional(),
        })
        // 처리 대상(전체·자세 권고·개별 알람) 중 하나는 있어야 함
        .refine((body) => body.all || body.resolvePostureAdvice || body.alarmId !== undefined),
    );
    if ('error' in parsed) return parsed.error;
    const { alarmId, all, resolvePostureAdvice } = parsed.data;
    const wheelchairId = (session.user as any).wheelchairId;

    let resolvedCount = 0;
    const client = await pool.connect();
    try {
      if (all) {
        // 전체 확인 처리
        const result = await client.query(
          'UPDATE alarms SET is_resolved = true WHERE wheelchair_id = $1 AND is_resolved = false',
          [wheelchairId],
        );
        resolvedCount = result.rowCount ?? 0;
      } else if (resolvePostureAdvice) {
        // 욕창 예방 완료(POSTURE_COMPLETE에 해당하는 ulcer_count 증가) 시 자세 권고만 일괄 확인
        const result = await client.query(
          `UPDATE alarms SET is_resolved = true
           WHERE wheelchair_id = $1 AND is_resolved = false
           AND UPPER(TRIM(COALESCE(alarm_type, ''))) = 'POSTURE_ADVICE'`,
          [wheelchairId],
        );
        resolvedCount = result.rowCount ?? 0;
      } else {
        // 개별 확인 처리
        const result = await client.query(
          'UPDATE alarms SET is_resolved = true WHERE id = $1 AND wheelchair_id = $2',
          [alarmId, wheelchairId],
        );
        resolvedCount = result.rowCount ?? 0;
      }
    } finally {
      client.release();
    }

    // 🔒 [감사] 알람 확인(미확인→확인) 상태 변경 기록 — 같은 DB 풀을 쓰므로 연결 반납 후, 바뀐 건이 있을 때만
    if (resolvedCount > 0) {
      await createAuditLog({
        userId: session.user.id,
        userRole: session.user.role,
        action: 'ALARM_RESOLVE',
        details: {
          wheelchairId,
          target: all ? 'ALL' : resolvePostureAdvice ? 'POSTURE_ADVICE' : 'SINGLE',
          alarmId: all || resolvePostureAdvice ? undefined : alarmId,
          resolvedCount,
          isResolved: 'false→true',
        },
        deviceSerial: session.user.deviceId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logServerError('알람 확인 처리 에러', error);
    return NextResponse.json({ message: 'Server Error' }, { status: 500 });
  }
}
