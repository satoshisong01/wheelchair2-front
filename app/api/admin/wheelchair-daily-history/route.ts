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
import { TimestreamQueryClient, QueryCommand } from '@aws-sdk/client-timestream-query';
import pool from '@/lib/db';

const queryClient = new TimestreamQueryClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
  // 정적 키가 없으면(EC2) credentials를 생략해 SDK가 인스턴스 IAM 역할을 쓰게 함
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
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
  operating_min: number | null;
  distance_m: number | null;
  latitude: number | null;
  longitude: number | null;
  ulcer_count: number;
  slope_count: number;
}

function assertSafe(value: string, regex: RegExp, label: string): void {
  if (typeof value !== 'string' || !regex.test(value)) {
    throw new Error(`Invalid ${label} format`);
  }
}

/**
 * Timestream에서 일별 집계 데이터 조회
 * - operating_time(사용시간)·runtime(주행시간)·distance(주행거리): 누적 카운터의
 *   하루 양(+) 증분만 합산 → 실제 일별 값 (카운터 리셋/정체값에 안전). MAX 방식은 부정확이라 폐기.
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
      AND measure_name IN ('latitude', 'longitude')
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
    const lastVal = parseFloat(data[4]?.ScalarValue || '0');

    if (!wcId || !day || !measureName) return;

    const key = `${wcId}|${day}`;
    if (!result.has(key)) {
      result.set(key, {
        wheelchair_id: wcId,
        date: day,
        runtime_min: null,
        operating_min: null,
        distance_m: null,
        latitude: null,
        longitude: null,
      });
    }

    const entry = result.get(key)!;
    if (measureName === 'latitude') entry.latitude = lastVal;
    else if (measureName === 'longitude') entry.longitude = lastVal;
  });

  // 사용시간(operating_time)·주행시간(runtime)·주행거리(distance)는 모두 누적 카운터다.
  // 카운터 리셋/정체값과 무관하게 KST 하루 동안의 양(+) 증분만 합산 → 실제 일별 값.
  // (그날 MAX 방식은 누적치/최장세션만 잡혀 부정확 → 세 값 모두 동일 방식으로 통일)
  const deltaQuery = `
    SELECT wheelchair_id,
           day,
           measure_name,
           SUM(pos_delta) AS day_delta
    FROM (
      SELECT wheelchair_id,
        DATE_FORMAT(BIN(time + 9h, 1d), '%Y-%m-%d') AS day,
        measure_name,
        GREATEST(
          measure_value::double - COALESCE(
            LAG(measure_value::double) OVER (
              PARTITION BY wheelchair_id, measure_name, DATE_FORMAT(BIN(time + 9h, 1d), '%Y-%m-%d')
              ORDER BY time
            ),
            measure_value::double
          ),
          0.0
        ) AS pos_delta
      FROM "${DATABASE_NAME}"."${TABLE_NAME}"
      WHERE ${whereClause} AND measure_name IN ('operating_time', 'runtime', 'distance')
    )
    GROUP BY wheelchair_id, day, measure_name
  `;

  // 증분 집계가 실패해도 위경도·욕창횟수는 정상 반환해야 하므로 격리한다.
  try {
    const deltaCommand = new QueryCommand({ QueryString: deltaQuery.trim() });
    const deltaResponse = await queryClient.send(deltaCommand);

    (deltaResponse.Rows || []).forEach((row) => {
      const data = row.Data;
      if (!data || data.length < 4) return;

      const wcId = data[0]?.ScalarValue || '';
      const day = data[1]?.ScalarValue || '';
      const measureName = data[2]?.ScalarValue || '';
      const dayDelta = parseFloat(data[3]?.ScalarValue || '0');

      if (!wcId || !day || !measureName) return;

      const key = `${wcId}|${day}`;
      if (!result.has(key)) {
        result.set(key, {
          wheelchair_id: wcId,
          date: day,
          runtime_min: null,
          operating_min: null,
          distance_m: null,
          latitude: null,
          longitude: null,
        });
      }
      const entry = result.get(key)!;
      if (measureName === 'operating_time') entry.operating_min = dayDelta;
      else if (measureName === 'runtime') entry.runtime_min = dayDelta;
      else if (measureName === 'distance') entry.distance_m = dayDelta;
    });
  } catch (e) {
    // 증분 집계만 생략되고 위경도·욕창 데이터는 정상 표시됨
    console.error('[wheelchair-daily-history] 일별 증분 집계 실패:', e);
  }

  // OPT가 없는 날짜(수집 이전 과거)는 '데이터 수신 흔적'으로 사용시간을 추정해 채운다.
  //   기기는 켜져 있을 때만 데이터를 보내므로, CW/st(각도) 점 사이 간격이 60초 이하인 구간의 합 = 켜져 있던 시간.
  //   OPT가 이미 채워진 날은 건드리지 않음(OPT 우선).
  const estQuery = `
    SELECT wheelchair_id, day, ROUND(SUM(gap_min), 0) AS est_min
    FROM (
      SELECT wheelchair_id, DATE_FORMAT(BIN(time + 9h, 1d), '%Y-%m-%d') AS day,
        CASE WHEN date_diff('second',
               LAG(time) OVER (PARTITION BY wheelchair_id, DATE_FORMAT(BIN(time + 9h, 1d), '%Y-%m-%d') ORDER BY time), time) BETWEEN 1 AND 60
          THEN date_diff('second',
               LAG(time) OVER (PARTITION BY wheelchair_id, DATE_FORMAT(BIN(time + 9h, 1d), '%Y-%m-%d') ORDER BY time), time) / 60.0
          ELSE 0 END AS gap_min
      FROM "${DATABASE_NAME}"."${TABLE_NAME}"
      WHERE ${whereClause} AND measure_name = 'angle_back'
    )
    GROUP BY wheelchair_id, day
  `;

  try {
    const estResponse = await queryClient.send(
      new QueryCommand({ QueryString: estQuery.trim() }),
    );
    (estResponse.Rows || []).forEach((row) => {
      const data = row.Data;
      if (!data || data.length < 3) return;
      const wcId = data[0]?.ScalarValue || '';
      const day = data[1]?.ScalarValue || '';
      const estMin = parseFloat(data[2]?.ScalarValue || '0');
      if (!wcId || !day) return;
      const key = `${wcId}|${day}`;
      if (result.has(key)) {
        // OPT가 이미 있으면 유지(OPT 우선), 없을 때만 추정치로 채움
        if (result.get(key)!.operating_min == null) {
          result.get(key)!.operating_min = estMin;
        }
      } else {
        result.set(key, {
          wheelchair_id: wcId,
          date: day,
          runtime_min: null,
          distance_m: null,
          latitude: null,
          longitude: null,
          operating_min: estMin,
        });
      }
    });
  } catch (e) {
    console.error('[wheelchair-daily-history] 사용시간 추정(데이터 수신 기반) 실패:', e);
  }

  return result;
}

/**
 * PostgreSQL에서 욕창 카운트 + 급경사 경고 횟수 + 디바이스 시리얼 조회
 * - 욕창: posture_daily 일별 롤업
 * - 급경사: alarms 테이블의 SLOPE_WARNING을 KST 일자별로 직접 COUNT
 */
async function fetchPgData(
  wheelchairId: string,
  from: string,
  to: string,
): Promise<{
  ulcerMap: Map<string, number>;
  slopeMap: Map<string, number>;
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

  // 급경사 경고 횟수 (alarms 테이블 SLOPE_WARNING / SLOPE → KST 일자별 COUNT)
  //   욕창(posture_daily)과 달리 전용 롤업이 없어 원본 알람에서 직접 집계한다.
  //   KST 하루 경계: [from 00:00 KST, (to+1) 00:00 KST)
  let slopeSql: string;
  let slopeParams: string[];
  if (wheelchairId === 'ALL') {
    slopeSql = `
      SELECT wheelchair_id::text AS wid,
             to_char((alarm_time AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM alarms
      WHERE UPPER(alarm_type) IN ('SLOPE_WARNING', 'SLOPE')
        AND alarm_time >= ($1::date)::timestamp AT TIME ZONE 'Asia/Seoul'
        AND alarm_time <  (($2::date) + 1)::timestamp AT TIME ZONE 'Asia/Seoul'
      GROUP BY wheelchair_id, day
    `;
    slopeParams = [from, to];
  } else {
    slopeSql = `
      SELECT wheelchair_id::text AS wid,
             to_char((alarm_time AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM alarms
      WHERE wheelchair_id = $1
        AND UPPER(alarm_type) IN ('SLOPE_WARNING', 'SLOPE')
        AND alarm_time >= ($2::date)::timestamp AT TIME ZONE 'Asia/Seoul'
        AND alarm_time <  (($3::date) + 1)::timestamp AT TIME ZONE 'Asia/Seoul'
      GROUP BY wheelchair_id, day
    `;
    slopeParams = [wheelchairId, from, to];
  }
  const slopeRes = await pool.query(slopeSql, slopeParams);
  const slopeMap = new Map<string, number>();
  for (const r of slopeRes.rows) {
    slopeMap.set(`${r.wid}|${r.day}`, Number(r.count ?? 0));
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

  return { ulcerMap, slopeMap, serialMap };
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

    // 데이터 셋의 모든 (wcId, date) 키 통합 (Timestream · 욕창 · 급경사)
    const allKeys = new Set<string>([
      ...tsMap.keys(),
      ...pgData.ulcerMap.keys(),
      ...pgData.slopeMap.keys(),
    ]);

    const rows: DailyRow[] = [];
    for (const key of allKeys) {
      const [wcId, date] = key.split('|');
      const tsEntry = tsMap.get(key) || {};
      const ulcerCount = pgData.ulcerMap.get(key) ?? 0;
      const slopeCount = pgData.slopeMap.get(key) ?? 0;
      const deviceSerial = pgData.serialMap.get(wcId) || wcId;

      // 정합성 보정: 주행은 사용의 부분집합이므로 주행시간 ≤ 사용시간.
      //   사용시간 0 → 주행시간·거리도 0(전원만 켜진 채 누적된 유령값 차단),
      //   주행시간 > 사용시간 → 사용시간으로 캡.
      const operatingMin = tsEntry.operating_min ?? null;
      let runtimeMin = tsEntry.runtime_min ?? null;
      let distanceM = tsEntry.distance_m ?? null;
      if (operatingMin != null && runtimeMin != null && runtimeMin > operatingMin) {
        runtimeMin = operatingMin;
      }
      if (operatingMin === 0) {
        runtimeMin = 0;
        distanceM = 0;
      }

      rows.push({
        wheelchair_id: wcId,
        device_serial: deviceSerial,
        date,
        runtime_min: runtimeMin,
        operating_min: operatingMin,
        distance_m: distanceM,
        latitude: tsEntry.latitude ?? null,
        longitude: tsEntry.longitude ?? null,
        ulcer_count: ulcerCount,
        slope_count: slopeCount,
      });
    }

    // 정렬: 날짜(최신 먼저)를 1순위 → 같은 날짜 안에서 기기순
    //   (전체 조회 시 같은 날짜의 여러 기기가 함께 묶여 나오도록)
    rows.sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) return byDate;
      return a.device_serial.localeCompare(b.device_serial);
    });

    return NextResponse.json(rows);
  } catch (error: any) {
    console.error('[wheelchair-daily-history] Error:', error);
    // 🔒 내부 오류 상세(스택·SQL·드라이버 메시지)를 클라이언트에 노출하지 않음 (서버 로그에만 기록)
    return NextResponse.json({ message: 'Server Error' }, { status: 500 });
  }
}
