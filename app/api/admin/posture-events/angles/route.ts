/**
 * 관리자용 자세 변경 이벤트 주변 휠체어 각도 조회
 * - 특정 알람(POSTURE_ADVICE / POSTURE_COMPLETE) 시각을 서버에서 조회하고
 *   그 앞뒤 window초 구간의 Timestream 각도 샘플을 반환
 * - 하드웨어 검증용: 기기가 이벤트를 올바르게 보냈는지 각도 추이로 확인
 *
 * GET ?alarmId=<uuid>&window=<seconds>
 *
 * 응답: { eventMs, deviceSerial, alarmType, window, samples: [...] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { TimestreamQueryClient, QueryCommand } from '@aws-sdk/client-timestream-query';
import { query } from '@/lib/db';

const queryClient = new TimestreamQueryClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const DATABASE_NAME = 'WheelchairDB';
const TABLE_NAME = 'WheelchairMetricsTable';

// 🔒 SQL Injection 방어: 입력값 화이트리스트 검증
const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DEVICE_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

const WINDOW_MIN = 5;
const WINDOW_MAX = 120;
const WINDOW_DEFAULT = 30;

interface AngleSample {
  time: string;
  angleBack: number | null;
  angleSeat: number | null;
  slopeSide: number | null;
  slopeFr: number | null;
  footAngle: number | null;
}

interface AnglesResponse {
  eventMs: number;
  deviceSerial: string;
  alarmType: string;
  window: number;
  samples: AngleSample[];
}

function assertSafe(value: string, regex: RegExp, label: string): void {
  if (typeof value !== 'string' || !regex.test(value)) {
    throw new Error(`Invalid ${label} format`);
  }
}

function toFiniteOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (!session || (role !== 'ADMIN' && role !== 'MASTER')) {
      return NextResponse.json({ message: '권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const alarmId = searchParams.get('alarmId');
    const windowRaw = searchParams.get('window');

    if (!alarmId) {
      return NextResponse.json({ message: 'alarmId 가 필요합니다.' }, { status: 400 });
    }
    assertSafe(alarmId, UUID_REGEX, 'alarmId');

    // window: 정수 파싱 후 [5, 120] 범위로 클램프
    let windowSec = parseInt(windowRaw ?? '', 10);
    if (Number.isNaN(windowSec)) windowSec = WINDOW_DEFAULT;
    windowSec = Math.min(WINDOW_MAX, Math.max(WINDOW_MIN, windowSec));

    // 🔒 이벤트 시각은 클라이언트를 신뢰하지 않고 서버에서 직접 조회
    const alarmRes = await query(
      `SELECT a.wheelchair_id::text AS "wheelchairId",
              w.device_serial AS "deviceSerial",
              a.alarm_type AS "alarmType",
              EXTRACT(EPOCH FROM a.alarm_time) AS "epochSec"
       FROM alarms a
       JOIN wheelchairs w ON w.id = a.wheelchair_id
       WHERE a.id = $1`,
      [alarmId],
    );

    if (alarmRes.rows.length === 0) {
      return NextResponse.json({ message: 'not found' }, { status: 404 });
    }

    const alarm = alarmRes.rows[0];
    const wheelchairId = String(alarm.wheelchairId);
    const deviceSerial = String(alarm.deviceSerial ?? '');
    const alarmType = String(alarm.alarmType ?? '');
    const eventMs = Number(alarm.epochSec) * 1000;

    // 서버에서 유도된 값이지만 인젝션 방어를 위해 재검증
    assertSafe(wheelchairId, UUID_REGEX, 'wheelchairId');
    assertSafe(deviceSerial, DEVICE_ID_REGEX, 'deviceSerial');

    const startISO = new Date(eventMs - windowSec * 1000).toISOString();
    const endISO = new Date(eventMs + windowSec * 1000).toISOString();

    const tsQuery = `
      SELECT time, measure_name, measure_value::double AS val
      FROM "${DATABASE_NAME}"."${TABLE_NAME}"
      WHERE time BETWEEN from_iso8601_timestamp('${startISO}') AND from_iso8601_timestamp('${endISO}')
        AND (wheelchair_id = '${wheelchairId}' OR device_serial = '${deviceSerial}')
        AND measure_name IN ('angle_back', 'angle_seat', 'slope_side', 'slope_fr', 'foot_angle')
      ORDER BY time ASC
    `;

    const command = new QueryCommand({ QueryString: tsQuery.trim() });
    const response = await queryClient.send(command);

    // time 문자열 기준으로 한 타임스탬프당 하나의 객체로 그룹핑
    const sampleMap = new Map<string, AngleSample>();

    (response.Rows || []).forEach((row) => {
      const data = row.Data;
      if (!data || data.length < 3) return;

      const timeStr = data[0]?.ScalarValue || '';
      const measureName = data[1]?.ScalarValue || '';
      const val = toFiniteOrNull(data[2]?.ScalarValue);

      if (!timeStr || !measureName) return;

      if (!sampleMap.has(timeStr)) {
        sampleMap.set(timeStr, {
          time: timeStr,
          angleBack: null,
          angleSeat: null,
          slopeSide: null,
          slopeFr: null,
          footAngle: null,
        });
      }

      const sample = sampleMap.get(timeStr)!;
      if (measureName === 'angle_back') sample.angleBack = val;
      else if (measureName === 'angle_seat') sample.angleSeat = val;
      else if (measureName === 'slope_side') sample.slopeSide = val;
      else if (measureName === 'slope_fr') sample.slopeFr = val;
      else if (measureName === 'foot_angle') sample.footAngle = val;
    });

    const result: AnglesResponse = {
      eventMs,
      deviceSerial,
      alarmType,
      window: windowSec,
      samples: Array.from(sampleMap.values()),
    };

    return NextResponse.json(result);
  } catch (error) {
    // 🔒 내부 오류 상세를 클라이언트에 노출하지 않음 (서버 로그에만 기록)
    console.error('[admin/posture-events/angles] Error:', error);
    return NextResponse.json({ message: 'Server Error' }, { status: 500 });
  }
}
