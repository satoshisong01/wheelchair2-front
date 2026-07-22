/**
 * 관리자용 자세 변경(욕창 방지) 이벤트 목록 조회
 * - 특정 기기의 KST 하루 동안 발생한 POSTURE_ADVICE / POSTURE_COMPLETE 알람을 반환
 * - 하드웨어 검증용: 이벤트별 휠체어 각도(±30초)를 확인하기 위한 목록
 *
 * GET ?wheelchairId=<uuid>&date=YYYY-MM-DD
 *
 * 응답: [{ id, alarmType, epochMs }, ...]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { query } from '@/lib/db';

// 🔒 SQL Injection 방어: 입력값 화이트리스트 검증
const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

interface PostureEvent {
  id: string;
  alarmType: string;
  epochMs: number;
}

function assertSafe(value: string, regex: RegExp, label: string): void {
  if (typeof value !== 'string' || !regex.test(value)) {
    throw new Error(`Invalid ${label} format`);
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (!session || (role !== 'ADMIN' && role !== 'MASTER')) {
      return NextResponse.json({ message: '권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const wheelchairId = searchParams.get('wheelchairId');
    const date = searchParams.get('date');

    if (!wheelchairId || !date) {
      return NextResponse.json({ message: 'wheelchairId, date 가 필요합니다.' }, { status: 400 });
    }

    assertSafe(wheelchairId, UUID_REGEX, 'wheelchairId');
    assertSafe(date, DATE_REGEX, 'date');

    // 🕒 KST 하루 경계를 JS에서 epoch 초로 계산 (컬럼 타입 모호성 회피)
    const startMs = new Date(`${date}T00:00:00+09:00`).getTime();
    const endMs = startMs + 24 * 60 * 60 * 1000;

    const sql = `
      SELECT id, alarm_type AS "alarmType", EXTRACT(EPOCH FROM alarm_time) AS "epochSec"
      FROM alarms
      WHERE wheelchair_id = $1
        AND alarm_type IN ('POSTURE_ADVICE', 'POSTURE_COMPLETE')
        AND EXTRACT(EPOCH FROM alarm_time) >= $2
        AND EXTRACT(EPOCH FROM alarm_time) < $3
      ORDER BY alarm_time ASC
    `;
    const result = await query(sql, [wheelchairId, startMs / 1000, endMs / 1000]);

    const events: PostureEvent[] = result.rows.map((r: any) => ({
      id: String(r.id),
      alarmType: String(r.alarmType),
      epochMs: Number(r.epochSec) * 1000,
    }));

    return NextResponse.json(events);
  } catch (error) {
    // 🔒 내부 오류 상세를 클라이언트에 노출하지 않음 (서버 로그에만 기록)
    console.error('[admin/posture-events] Error:', error);
    return NextResponse.json({ message: 'Server Error' }, { status: 500 });
  }
}
