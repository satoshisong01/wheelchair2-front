// 📍 경로: app/api/stats/route.ts (수정된 전체 코드)

import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { GoogleGenAI } from '@google/genai';
import { TimestreamQueryClient, QueryCommand } from '@aws-sdk/client-timestream-query';

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

// ⭐️ [수정 없음] Timestream 쿼리 함수는 모든 지표를 잘 가져오고 있음
async function fetchTimestreamData(
  deviceId: string,
  startDate: string,
  endDate: string,
  binUnit: string,
  startHour: string = '00',
  endHour: string = '23',
): Promise<{ data: any[]; query: string }> {
  // 1. WHERE 절: 한국 시간 기준으로 범위 설정 (+09:00 명시)
  const startTs = `${startDate}T${startHour}:00:00+09:00`;
  const endTs = `${endDate}T${endHour}:59:59+09:00`;

  let whereClause = `time BETWEEN from_iso8601_timestamp('${startTs}') AND from_iso8601_timestamp('${endTs}')`;

  if (deviceId !== 'ALL') {
    whereClause += ` AND (wheelchair_id = '${deviceId}' OR device_serial = '${deviceId}')`;
  }

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
  const dataMap: Record<string, any> = {};

  rows.forEach((row) => {
    const data = row.Data;
    if (!data) return;

    const timeStr = data[0].ScalarValue;
    const measureName = data[1].ScalarValue;

    const avgVal = parseFloat(data[2].ScalarValue || '0');
    const maxVal = parseFloat(data[3].ScalarValue || '0');
    const lastVal = parseFloat(data[4].ScalarValue || '0');

    if (timeStr && measureName) {
      if (!dataMap[timeStr]) {
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

      if (measureName === METRIC_CONFIG.BATTERY.measure) {
        dataMap[timeStr].avgBattery = parseFloat(avgVal.toFixed(1));
        dataMap[timeStr].maxBattery = parseFloat(maxVal.toFixed(1));
      } else if (
        measureName === METRIC_CONFIG.SPEED.measure ||
        measureName === METRIC_CONFIG.SPEED.alternative
      ) {
        dataMap[timeStr].avgSpeed = parseFloat(avgVal.toFixed(1));
        dataMap[timeStr].maxSpeed = parseFloat(maxVal.toFixed(1));
      } else if (
        measureName === METRIC_CONFIG.DISTANCE.measure ||
        measureName === METRIC_CONFIG.DISTANCE.alternative
      ) {
        dataMap[timeStr].avgDistance = parseFloat(lastVal.toFixed(1));
        dataMap[timeStr].maxDistance = parseFloat(maxVal.toFixed(1));
      }
    }
  });

  const formattedData = Object.values(dataMap).sort(
    (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return { data: formattedData, query: trimmedQuery };
}

// --- AI 분석 함수 ---
async function generateAnalysisComment(
  deviceId: string,
  formattedData: any[],
  metric: string, // 현재 선택된 Metric (BATTERY, SPEED, DISTANCE)
  unit: string,
  mode: string,
  dates: { startDate?: string; endDate?: string; compareDates?: string[] },
): Promise<string> {
  // 데이터가 너무 적으면 분석 스킵
  if (formattedData.length < (mode === 'COMPARE' ? 1 : 1)) {
    return '선택하신 기간에 분석할 데이터가 충분하지 않습니다.';
  }

  // AI에게 전달할 데이터: 배터리, 속도, 거리 데이터를 모두 포함
  const dataForAI = formattedData.map((d) => ({
    date: d.date,
    avgBattery: d.avgBattery,
    avgSpeed: d.avgSpeed,
    avgDistance: d.avgDistance,
    maxBattery: d.maxBattery,
    maxSpeed: d.maxSpeed,
  }));
  const dataJsonString = JSON.stringify(dataForAI.slice(0, 50), null, 2);

  const dateRange =
    mode === 'COMPARE'
      ? `${dates.compareDates?.[0]} vs ${dates.compareDates?.[1]}`
      : `${dates.startDate} ~ ${dates.endDate}`;

  // ⭐️ [핵심 수정 1] 전체 기기일 경우 심층 분석 스킵
  if (deviceId === 'ALL') {
    return '개별 기기를 선택하시면 AI 심층 분석 리포트가 제공됩니다.';
  }

  const selectedMetricLabel = METRIC_CONFIG[metric]?.label || '주요 지표';

  // ⭐️ [핵심 수정 2] 선택된 Metric에 따라 프롬프트의 초점을 동적으로 변경
  const metricFocusPrompt = `
    ${selectedMetricLabel}의 변화 추이에 맞춰 분석하되, 
    배터리 잔량(avgBattery), 평균 속도(avgSpeed), 주행 거리(avgDistance) 간의 **상관관계 및 통합적인 패턴**을 해석하는 데 집중해주세요.
  `;

  // ⭐️ [핵심 수정 3] COMPARE 모드 분석 조건 상세화 (운행 패턴 해석 강화)
  const compareConditionPrompt = `
    3. **COMPARE 모드**라면: 
       두 날짜의 ${selectedMetricLabel} 변화를 비교하고, 
       특히 **운행 패턴(속도/주행거리)**과 **배터리 소모**를 연관 지어 분석하세요.
       예를 들어, **배터리 감소가 크지 않은데 속도/주행거리가 증가했다면** 효율적인 운행으로 해석하고, 
       **배터리 감소는 있으나 속도/주행거리가 0에 가까운 시간대**가 반복된다면 **"운행 없는 대기 상태 지속"**으로 해석하여 비효율적 사용 패턴을 언급하세요.
  `;

  // ⭐️ [핵심 수정 4] RANGE 모드 분석 조건 상세화
  const rangeConditionPrompt = `
    4. **RANGE 모드**라면: 기간 동안의 ${selectedMetricLabel} 변화의 전반적인 추세(상승, 하락, 안정)를 분석하고, 
       다른 지표들과의 관계를 통해 사용자 운행 습관의 특이점(예: 급격한 속도 변화, 장거리 운행 집중)을 해석하세요.
  `;

  const prompt = `
        당신은 휠체어 데이터 분석가입니다. 다음 JSON 데이터 배열을 분석하여 
        기기 ${deviceId}의 ${dateRange} 기간에 대한 데이터를 분석하고 **가장 중요한 패턴과 인사이트**를 한국어로 작성해주세요.
        
        [분석 조건]:
        1. 조회 모드는 **${mode}**이며, 집계 단위는 **${unit}**입니다.
        2. ${metricFocusPrompt}
        
        ${mode === 'COMPARE' ? compareConditionPrompt : rangeConditionPrompt}

        5. 멘트에는 사용 습관의 변화나 장기적인 **성능/효율성** 관련 전문적인 분석을 포함하세요. 
        6. 분석 결과는 **5줄 내외**의 간결하고 전문적인 문체로 작성하세요.
        
        [분석할 통합 데이터 배열 (객체 키: date, avgBattery, avgSpeed, avgDistance 등)]:
        ${dataJsonString}
        
        [분석 결과 멘트]:
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
  // ⭐️ [수정 없음] (POST 핸들러 로직)
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
      metric: selectedMetric,
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

      const resultA = await fetchTimestreamData(
        deviceId,
        dateA,
        dateA,
        binUnit,
        startHour,
        endHour,
      );
      const dataA = resultA.data.map((d: any) => ({ ...d, source: dateA }));

      const resultB = await fetchTimestreamData(
        deviceId,
        dateB,
        dateB,
        binUnit,
        startHour,
        endHour,
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
        endHour,
      );
      allFormattedData = result.data.map((d: any) => ({
        ...d,
        source: 'range',
      }));
      finalQuery = result.query;
    }

    // ⭐️ AI 분석 호출: 모든 지표 데이터가 담긴 allFormattedData를 전달합니다.
    const analysisComment = await generateAnalysisComment(
      deviceId,
      allFormattedData,
      selectedMetric, // AI 분석 함수가 사용할 Metric
      timeUnit,
      mode,
      { startDate, endDate, compareDates },
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
      { status: 500 },
    );
  }
}
