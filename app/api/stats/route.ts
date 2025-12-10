// 📍 경로: app/api/stats/route.ts
// 📝 설명: 모든 지표(배터리, 속도, 주행거리)를 한 번에 조회하도록 수정됨

import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { GoogleGenAI } from '@google/genai';
import {
  TimestreamQueryClient,
  QueryCommand,
} from '@aws-sdk/client-timestream-query';

// AWS Timestream 클라이언트 설정
const queryClient = new TimestreamQueryClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Google Gemini AI 설정
const API_KEY = process.env.GOOGLE_AI_API_KEY || '';
const genAI = new GoogleGenAI({ apiKey: API_KEY });

const DATABASE_NAME = 'WheelchairDB';
const TABLE_NAME = 'WheelchairMetricsTable';

const METRIC_CONFIG: Record<string, any> = {
  BATTERY: { label: '평균 배터리 잔량', measure: 'battery_percent' },
  SPEED: { label: '평균 속도', measure: 'speed', alternative: 'current_speed' },
  DISTANCE: {
    label: '주행 거리',
    measure: 'distance',
    alternative: 'driving_dist',
  },
};

// 모든 측정 항목의 이름을 배열로 생성
const ALL_MEASURE_NAMES = [
  METRIC_CONFIG.BATTERY.measure,
  METRIC_CONFIG.SPEED.measure,
  METRIC_CONFIG.SPEED.alternative,
  METRIC_CONFIG.DISTANCE.measure,
  METRIC_CONFIG.DISTANCE.alternative,
]
  .filter(Boolean)
  .map((name: string) => `'${name}'`)
  .join(', ');

// ⭐️ [수정] Timestream 쿼리 함수: Metric 파라미터 제거
async function fetchTimestreamData(
  deviceId: string,
  startDate: string,
  endDate: string,
  binUnit: string,
  startHour: string = '00',
  endHour: string = '23'
): Promise<{ data: any[]; query: string }> {
  // 1. WHERE 절: 한국 시간 기준으로 범위 설정 (+09:00 명시)
  const startTs = `${startDate}T${startHour}:00:00+09:00`;
  const endTs = `${endDate}T${endHour}:59:59+09:00`;

  let whereClause = `time BETWEEN from_iso8601_timestamp('${startTs}') AND from_iso8601_timestamp('${endTs}')`;

  if (deviceId !== 'ALL') {
    whereClause += ` AND (wheelchair_id = '${deviceId}' OR device_serial = '${deviceId}')`;
  }

  // ⭐️ [수정] 쿼리: 모든 Measure Name을 조회
  const query = `
    SELECT 
      BIN(time + 9h, ${binUnit}) as date_bin,
      measure_name,
      AVG(measure_value::double) as avg_val, 
      MAX(measure_value::double) as max_val,
      MAX_BY(measure_value::double, time) as last_val 
    FROM "${DATABASE_NAME}"."${TABLE_NAME}"
    WHERE ${whereClause}
      AND measure_name IN (${ALL_MEASURE_NAMES})
    GROUP BY BIN(time + 9h, ${binUnit}), measure_name
    ORDER BY date_bin ASC
    `;

  const trimmedQuery = query.trim();
  const command = new QueryCommand({ QueryString: trimmedQuery });
  const response = await queryClient.send(command);

  const rows = response.Rows || [];
  // ⭐️ [수정] 데이터 매핑 구조 변경: date_bin을 키로 사용하고, 그 안에 모든 Metric을 통합
  const dataMap: Record<string, any> = {};

  rows.forEach((row) => {
    const data = row.Data;
    if (!data) return;

    const timeStr = data[0].ScalarValue;
    const measureName = data[1].ScalarValue;

    const avgVal = parseFloat(data[2].ScalarValue || '0');
    const maxVal = parseFloat(data[3].ScalarValue || '0'); // MAX 값 추가
    const lastVal = parseFloat(data[4].ScalarValue || '0'); // MAX_BY 값

    if (timeStr && measureName) {
      if (!dataMap[timeStr]) {
        // 기본 템플릿 정의
        dataMap[timeStr] = {
          date: timeStr,
          avgBattery: 0,
          maxBattery: 0,
          avgSpeed: 0,
          maxSpeed: 0,
          avgDistance: 0,
          maxDistance: 0,
        };
      }

      // ⭐️ [수정] 측정 항목별로 통합된 객체에 값 매핑
      // 1. 배터리
      if (measureName === METRIC_CONFIG.BATTERY.measure) {
        dataMap[timeStr].avgBattery = parseFloat(avgVal.toFixed(1));
        dataMap[timeStr].maxBattery = parseFloat(maxVal.toFixed(1));
      }
      // 2. 속도
      else if (
        measureName === METRIC_CONFIG.SPEED.measure ||
        measureName === METRIC_CONFIG.SPEED.alternative
      ) {
        dataMap[timeStr].avgSpeed = parseFloat(avgVal.toFixed(1));
        dataMap[timeStr].maxSpeed = parseFloat(maxVal.toFixed(1));
      }
      // 3. 주행거리 (MAX_BY(last_val) 사용)
      else if (
        measureName === METRIC_CONFIG.DISTANCE.measure ||
        measureName === METRIC_CONFIG.DISTANCE.alternative
      ) {
        // 주행거리는 MAX_BY(last_val)을 avgDistance에, MAX(max_val)을 maxDistance에 사용
        dataMap[timeStr].avgDistance = parseFloat(lastVal.toFixed(1));
        dataMap[timeStr].maxDistance = parseFloat(maxVal.toFixed(1));
      }
    }
  });

  const formattedData = Object.values(dataMap).sort(
    (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return { data: formattedData, query: trimmedQuery };
}

// --- AI 분석 함수 ---
// (선택된 단일 Metric과 통합 데이터를 받아 AI 분석을 수행하는 로직은 유지됨)
async function generateAnalysisComment(
  deviceId: string,
  formattedData: any[],
  metric: string,
  unit: string,
  mode: string,
  dates: { startDate?: string; endDate?: string; compareDates?: string[] }
): Promise<string> {
  // 데이터가 너무 적으면 분석 스킵
  if (formattedData.length < (mode === 'COMPARE' ? 1 : 1)) {
    return '선택하신 기간에 분석할 데이터가 충분하지 않습니다.';
  }

  // ⭐️ [수정] AI 분석 시 'selectedMetric' 관련 데이터만 필터링하여 전달
  const batteryDataForAI = formattedData.map((d) => ({
    date: d.date,
    avgBattery: d.avgBattery,
    maxBattery: d.maxBattery,
  }));
  const dataJsonString = JSON.stringify(batteryDataForAI.slice(0, 50), null, 2);

  const dateRange =
    mode === 'COMPARE'
      ? `${dates.compareDates?.[0]} vs ${dates.compareDates?.[1]}`
      : `${dates.startDate} ~ ${dates.endDate}`;

  // 배터리 분석이 아니거나 전체 기기면 간단 멘트
  if (metric !== 'BATTERY' || deviceId === 'ALL') {
    if (deviceId === 'ALL')
      return '개별 기기를 선택하시면 AI 심층 분석 리포트가 제공됩니다.';
    return '현재 AI 분석은 배터리 데이터에 최적화되어 있습니다.';
  }

  const prompt = `
        당신은 휠체어 데이터 분석가입니다. 다음 JSON 데이터 배열을 분석하여 
        기기 ${deviceId}의 ${dateRange} 기간에 대한 **배터리 잔량(avgBattery, maxBattery)** 변화의 **가장 중요한 패턴과 인사이트**를 한국어로 작성해주세요.
        
        [분석 조건]:
        1. 조회 모드는 **${mode}**이며, 집계 단위는 **${unit}**입니다.
        2. 기간 전체의 **평균 배터리 잔량**을 언급하세요.

        3. **COMPARE 모드**라면 (날짜 ${dates.compareDates?.[0]} vs ${dates.compareDates?.[1]}): 
            두 날짜의 **평균 잔량**과 **최대 잔량(maxBattery)**을 비교하여, 잔량 감소 패턴의 변화(하락 속도)를 중점적으로 분석하고 멘트에 포함하세요. 이 차이는 **배터리 성능 저하의 잠재적 신호**일 수 있음을 언급하세요.

        4. **RANGE 모드**라면: 기간의 **시작일**과 **마지막 날**의 평균 잔량을 비교하여 전반적인 추세를 분석하세요.

        5. 멘트에는 사용 습관의 변화나 **성능 저하 여부**를 추측하는 전문적인 분석을 포함하세요. (예: "일일 충전 후 평균 잔량 감소 속도가 빨라진 것으로 보아 배터리 성능 저하 가능성이 있습니다.")

        [분석할 데이터 배열 (객체 키: date, avgBattery, maxBattery 등)]:
        ${dataJsonString}
        
        [분석 결과 멘트]:
        - **5줄 내외**의 간결하고 전문적인 문체로 작성하세요.
        - Markdown(예: **볼드체**)을 사용하여 주요 수치를 강조하세요.
    `;

  try {
    const aiResult = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return aiResult.text.trim();
  } catch (error) {
    console.error('Gemini Analysis Error:', error);
    return 'AI 분석 서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.';
  }
}

// --- POST 핸들러 ---
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const {
      mode,
      startDate,
      endDate,
      compareDates,
      deviceId: requestDeviceId,
      metric: selectedMetric, // ⭐️ [수정] AI 분석을 위해 Metric 정보는 계속 받음
      unit: timeUnit,
      startHour,
      endHour,
    } = await request.json();

    if (mode === 'RANGE' && (!startDate || !endDate)) {
      return NextResponse.json({ message: '기간 범위 오류' }, { status: 400 });
    }
    if (mode === 'COMPARE' && (!compareDates || compareDates.length !== 2)) {
      return NextResponse.json({ message: '비교 날짜 오류' }, { status: 400 });
    }

    // 권한 및 기기 ID 설정
    const userRole = session.user.role;
    let deviceId = requestDeviceId;
    if (userRole === 'DEVICE_USER') {
      // @ts-ignore
      deviceId = String(session.user.wheelchairId);
    } else if (!deviceId) {
      deviceId = 'ALL';
    }

    let allFormattedData: any[] = [];
    let finalQuery = '';

    // 시간 단위 (비교 모드는 무조건 1시간 단위)
    const binUnit = mode === 'COMPARE' || timeUnit === 'hourly' ? '1h' : '1d';

    if (mode === 'COMPARE') {
      const dateA = compareDates[0];
      const dateB = compareDates[1];

      // ⭐️ [수정] fetchTimestreamData에 Metric 파라미터 제거
      const resultA = await fetchTimestreamData(
        deviceId,
        dateA,
        dateA,
        binUnit,
        startHour,
        endHour
      );
      const dataA = resultA.data.map((d: any) => ({ ...d, source: dateA }));

      const resultB = await fetchTimestreamData(
        deviceId,
        dateB,
        dateB,
        binUnit,
        startHour,
        endHour
      );
      const dataB = resultB.data.map((d: any) => ({ ...d, source: dateB }));

      allFormattedData = [...dataA, ...dataB];
      finalQuery = `${resultA.query}\n-- AND\n${resultB.query}`;
    } else {
      // RANGE 모드
      const result = await fetchTimestreamData(
        deviceId,
        startDate,
        endDate,
        binUnit,
        startHour,
        endHour
      );
      allFormattedData = result.data.map((d: any) => ({
        ...d,
        source: 'range',
      }));
      finalQuery = result.query;
    }

    // ⭐️ [수정] AI 분석: 모든 지표 데이터가 담긴 allFormattedData를 전달하고,
    // AI 분석 함수 내부에서 선택된 Metric에 따라 로직 분기 (현재는 BATTERY만 심층 분석)
    const analysisComment = await generateAnalysisComment(
      deviceId,
      allFormattedData,
      selectedMetric, // AI 분석 함수가 사용할 Metric
      timeUnit,
      mode,
      { startDate, endDate, compareDates }
    );

    return NextResponse.json({
      data: allFormattedData,
      comment: analysisComment,
      query: finalQuery,
    });
  } catch (error: any) {
    console.error('[API Error]:', error);
    return NextResponse.json(
      { message: 'Server Error', error: error.message, data: [] },
      { status: 500 }
    );
  }
}
