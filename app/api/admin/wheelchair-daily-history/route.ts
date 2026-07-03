/**
 * 관리자용 기기 일별 사용 내역 조회
 * - 사용시간/주행거리/위경도 (Timestream에서 일별 집계)
 * - 욕창 방지 횟수 (PostgreSQL posture_daily LEFT JOIN)
 *
 * GET ?wheelchairId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD  → 단일 기기
 * GET ?wheelchairId=ALL&from=YYYY-MM-DD&to=YYYY-MM-DD  → 전체 기기
 *
 * 응답:
 *   [
 *     {
 *       wheelchair_id, device_serial, date,
 *       runtime_min, distance_m, latitude, longitude, ulcer_count
 *     },
 *     ...
 *   ]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { Pool } from 'pg';
import { TimestreamQueryClient, QueryCommand } from '@aws-sdk/client-timestream-query';
import { getDbSslOption } from '@/lib/db';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: getDbSslOption(),
});

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
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

interface DailyRow {
  wheelchair_id: string;
  device_serial: string;
  date: string;
  runtime_min: number | null;
  distance_m: number | null;
  latitude: number | null;
  longitude: number | null;
  ulcer_count: number;
}

function assertSafe(value: string, regex: RegExp, label: string): void {
  if (typeof value !== 'string' || !regex.test(value)) {
    throw new Error(`Invalid ${label} format`);
  }
}

/**
 * Timestream에서 일별 집계 데이터 조회
 * - runtime, distance: 그날의 MAX (자정 직전 누적값 = 그날 증가량)
 * - latitude, longitude: 그날의 마지막 측정값 (MAX_BY)
 */
async function fetchTimestreamDaily(
  wheelchairId: string,
  from: string,
  to: string,
): Promise<Map<string, Partial<DailyRow>>> {
  const startTs = `${from}T00:00:00+09:00`;
  const endTs = `${to}T23:59:59+09:00`;

  let whereClause = `time BETWEEN from_iso8601_timestamp('${startTs}') AND from_iso8601_timestamp('${endTs}')`;

  if (wheelchairId !== 'ALL') {
    whereClause += ` AND wheelchair_id = '${wheelchairId}'`;
  }

  const query = `
    SELECT
      wheelchair_id,
      DATE_FORMAT(BIN(time + 9h, 1d), '%Y-%m-%d') AS day,
      measure_name,
      MAX(measure_value::double) AS max_val,
      MAX_BY(measure_value::double, time) AS last_val
    FROM "${DATABASE_NAME}"."${TABLE_NAME}"
    WHERE ${whereClause}
      AND measure_name IN ('runtime', 'distance', 'latitude', 'longitude')
    GROUP BY wheelchair_id, BIN(time + 9h, 1d), measure_name
    ORDER BY wheelchair_id, day ASC
  `;

  const command = new QueryCommand({ QueryString: query.trim() });
  const response = await queryClient.send(command);

  // key: "wheelchair_id|date" → row
  const result = new Map<string, Partial<DailyRow>>();

  (response.Rows || []).forEach((row) => {
    const data = row.Data;
    if (!data || data.length < 5) return;

    const wcId = data[0]?.ScalarValue || '';
    const day = data[1]?.ScalarValue || '';
    const measureName = data[2]?.ScalarValue || '';
    const maxVal = parseFloat(data[3]?.ScalarValue || '0');
    const lastVal = parseFloat(data[4]?.ScalarValue || '0');

    if (!wcId || !day || !measureName) return;

    const key = `${wcId}|${day}`;
    if (!result.has(key)) {
      result.set(key, {
        wheelchair_id: wcId,
        date: day,
        runtime_min: null,
        distance_m: null,
        latitude: null,
        longitude: null,
      });
    }

    const entry = result.get(key)!;
    if (measureName === 'runtime') entry.runtime_min = maxVal;
    else if (measureName === 'distance') entry.distance_m = maxVal;
    else if (measureName === 'latitude') entry.latitude = lastVal;
    else if (measureName === 'longitude') entry.longitude = lastVal;
  });

  return result;
}

/**
 * PostgreSQL에서 욕창 카운트 + 디바이스 시리얼 조회
 */
async function fetchPgData(
  wheelchairId: string,
  from: string,
  to: string,
): Promise<{
  ulcerMap: Map<string, number>;
  serialMap: Map<string, string>;
}> {
  // 욕창 카운트
  let ulcerSql: string;
  let ulcerParams: any[];
  if (wheelchairId === 'ALL') {
    ulcerSql = `
      SELECT wheelchair_id::text AS wid, date, count
      FROM posture_daily
      WHERE date >= $1::date AND date <= $2::date
    `;
    ulcerParams = [from, to];
  } else {
    ulcerSql = `
      SELECT wheelchair_id::text AS wid, date, count
      FROM posture_daily
      WHERE wheelchair_id = $1 AND date >= $2::date AND date <= $3::date
    `;
    ulcerParams = [wheelchairId, from, to];
  }
  const ulcerRes = await pool.query(ulcerSql, ulcerParams);
  const ulcerMap = new Map<string, number>();
  for (const r of ulcerRes.rows) {
    const dateStr =
      r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
    ulcerMap.set(`${r.wid}|${dateStr}`, Number(r.count ?? 0));
  }

  // 디바이스 시리얼
  let serialSql: string;
  let serialParams: any[];
  if (wheelchairId === 'ALL') {
    serialSql = `SELECT id::text AS id, device_serial FROM wheelchairs`;
    serialParams = [];
  } else {
    serialSql = `SELECT id::text AS id, device_serial FROM wheelchairs WHERE id = $1`;
    serialParams = [wheelchairId];
  }
  const serialRes = await pool.query(serialSql, serialParams);
  const serialMap = new Map<string, string>();
  for (const r of serialRes.rows) {
    serialMap.set(r.id, r.device_serial || r.id);
  }

  return { ulcerMap, serialMap };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (!session || (role !== 'ADMIN' && role !== 'MASTER')) {
      return NextResponse.json({ message: '권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const wheelchairId = searchParams.get('wheelchairId') || 'ALL';
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json({ message: 'from, to 가 필요합니다.' }, { status: 400 });
    }

    assertSafe(from, DATE_REGEX, 'from');
    assertSafe(to, DATE_REGEX, 'to');
    if (wheelchairId !== 'ALL') {
      assertSafe(wheelchairId, UUID_REGEX, 'wheelchairId');
    }

    // 병렬 조회
    const [tsMap, pgData] = await Promise.all([
      fetchTimestreamDaily(wheelchairId, from, to),
      fetchPgData(wheelchairId, from, to),
    ]);

    // 두 데이터 셋의 모든 (wcId, date) 키 통합
    const allKeys = new Set<string>([...tsMap.keys(), ...pgData.ulcerMap.keys()]);

    const rows: DailyRow[] = [];
    for (const key of allKeys) {
      const [wcId, date] = key.split('|');
      const tsEntry = tsMap.get(key) || {};
      const ulcerCount = pgData.ulcerMap.get(key) ?? 0;
      const deviceSerial = pgData.serialMap.get(wcId) || wcId;

      rows.push({
        wheelchair_id: wcId,
        device_serial: deviceSerial,
        date,
        runtime_min: tsEntry.runtime_min ?? null,
        distance_m: tsEntry.distance_m ?? null,
        latitude: tsEntry.latitude ?? null,
        longitude: tsEntry.longitude ?? null,
        ulcer_count: ulcerCount,
      });
    }

    // 정렬: device_serial → date
    rows.sort((a, b) => {
      if (a.device_serial !== b.device_serial) {
        return a.device_serial.localeCompare(b.device_serial);
      }
      return a.date.localeCompare(b.date);
    });

    return NextResponse.json(rows);
  } catch (error: any) {
    console.error('[wheelchair-daily-history] Error:', error);
    // 🔒 내부 오류 상세(스택·SQL·드라이버 메시지)를 클라이언트에 노출하지 않음 (서버 로그에만 기록)
    return NextResponse.json({ message: 'Server Error' }, { status: 500 });
  }
}
