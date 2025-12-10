// 📍 경로: app/api/stats/route.ts
// 📝 설명: 프론트엔드에서 보낸 시간 범위(startHour, endHour)를 적용하여 쿼리하도록 수정됨

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

// --- [핵심 수정 1] Timestream 쿼리 함수: startHour, endHour 파라미터 추가 ---
async function fetchTimestreamData(
  deviceId: string,
  startDate: string,
  endDate: string,
  metric: string,
  binUnit: string,
  startHour: string = '00',
  endHour: string = '23'
): Promise<{ data: any[]; query: string }> {
  const measureNames = [
    METRIC_CONFIG[metric]?.measure,
    METRIC_CONFIG[metric]?.alternative,
  ]
    .filter(Boolean)
    .map((name: string) => `'${name}'`)
    .join(', ');

  // 1. WHERE 절: 한국 시간 기준으로 범위 설정 (+09:00 명시)
  // 예: 사용자가 09시를 선택하면, UTC로는 00시부터 검색됨 (정확함)
  const startTs = `${startDate}T${startHour}:00:00+09:00`;
  const endTs = `${endDate}T${endHour}:59:59+09:00`;

  let whereClause = `time BETWEEN from_iso8601_timestamp('${startTs}') AND from_iso8601_timestamp('${endTs}')`;

  if (deviceId !== 'ALL') {
    whereClause += ` AND (wheelchair_id = '${deviceId}' OR device_serial = '${deviceId}')`;
  }

  // ⭐️ [수정 핵심] AT TIME ZONE 대신 'time + 9h' 사용
  // 이유: BIN 함수 내부에서 타입 에러를 피하면서 KST(한국시간)로 그룹화하는 가장 안전한 방법입니다.
  const query = `
    SELECT 
      BIN(time + 9h, ${binUnit}) as date_bin,
      measure_name,
      AVG(measure_value::double) as avg_val, 
      MAX_BY(measure_value::double, time) as last_val 
    FROM "${DATABASE_NAME}"."${TABLE_NAME}"
    WHERE ${whereClause}
      AND measure_name IN (${measureNames})
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

    // Timestream은 시간을 UTC로 반환함 (예: 2025-12-01 12:00:00.000000000)
    const timeStr = data[0].ScalarValue;
    const measureName = data[1].ScalarValue;

    const avgVal = parseFloat(data[2].ScalarValue || '0');
    const lastVal = parseFloat(data[3].ScalarValue || '0');

    if (timeStr && measureName) {
      if (!dataMap[timeStr]) {
        dataMap[timeStr] = {
          date: timeStr, // 프론트엔드에서 substring으로 날짜/시간 추출함
          avgBattery: 0,
          avgSpeed: 0,
          avgDistance: 0,
          lastBattery: 0,
        };
      }

      if (measureName === 'battery_percent') {
        dataMap[timeStr].avgBattery = parseFloat(avgVal.toFixed(1));
        dataMap[timeStr].lastBattery = parseFloat(lastVal.toFixed(1));
      } else if (measureName === 'speed' || measureName === 'current_speed') {
        dataMap[timeStr].avgSpeed = parseFloat(avgVal.toFixed(1));
      } else if (measureName === 'distance' || measureName === 'driving_dist') {
        dataMap[timeStr].avgDistance = parseFloat(lastVal.toFixed(1));
      }
    }
  });

  const formattedData = Object.values(dataMap).sort(
    (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return { data: formattedData, query: trimmedQuery };
}

// --- AI 분석 함수 ---
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

  const dataJsonString = JSON.stringify(formattedData.slice(0, 50), null, 2);
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
        기기 ${deviceId}의 ${dateRange} 기간에 대한 **배터리 잔량(avgBattery, lastBattery)** 변화의 **가장 중요한 패턴과 인사이트**를 한국어로 작성해주세요.
        
        [분석 조건]:
        1. 조회 모드는 **${mode}**이며, 집계 단위는 **${unit}**입니다.
        2. 기간 전체의 **평균 배터리 잔량**을 언급하세요.

        3. **COMPARE 모드**라면 (날짜 ${dates.compareDates?.[0]} vs ${dates.compareDates?.[1]}): 
           두 날짜의 **평균 잔량**과 **최대/최소 잔량**을 비교하여, 잔량 감소 패턴의 변화(하락 속도)를 중점적으로 분석하고 멘트에 포함하세요. 이 차이는 **배터리 성능 저하의 잠재적 신호**일 수 있음을 언급하세요.

        4. **RANGE 모드**라면: 기간의 **시작일**과 **마지막 날**의 평균 잔량을 비교하여 전반적인 추세를 분석하세요.

        5. 멘트에는 사용 습관의 변화나 **성능 저하 여부**를 추측하는 전문적인 분석을 포함하세요. (예: "일일 충전 후 평균 잔량 감소 속도가 빨라진 것으로 보아 배터리 성능 저하 가능성이 있습니다.")

        [분석할 데이터 배열 (객체 키: date, avgBattery, lastBattery 등)]:
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

    // ⭐️ [핵심 수정 2] 프론트엔드에서 보낸 startHour, endHour 받기
    const {
      mode,
      startDate,
      endDate,
      compareDates,
      deviceId: requestDeviceId,
      metric: selectedMetric,
      unit: timeUnit,
      startHour, // UI에서 보낸 시작 시간 (예: "09")
      endHour, // UI에서 보낸 종료 시간 (예: "18")
    } = await request.json();

    // ... (유효성 검사 로직은 기존과 동일) ...
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

      // ⭐️ [핵심 수정 3] fetchTimestreamData에 시간 범위(startHour, endHour) 전달
      const resultA = await fetchTimestreamData(
        deviceId,
        dateA,
        dateA,
        selectedMetric,
        binUnit,
        startHour,
        endHour // 전달
      );
      // 소스 태그 추가 (프론트에서 구분용)
      const dataA = resultA.data.map((d) => ({ ...d, source: dateA }));

      const resultB = await fetchTimestreamData(
        deviceId,
        dateB,
        dateB,
        selectedMetric,
        binUnit,
        startHour,
        endHour // 전달
      );
      const dataB = resultB.data.map((d) => ({ ...d, source: dateB }));

      allFormattedData = [...dataA, ...dataB];
      finalQuery = `${resultA.query}\n-- AND\n${resultB.query}`;
    } else {
      // RANGE 모드
      const result = await fetchTimestreamData(
        deviceId,
        startDate,
        endDate,
        selectedMetric,
        binUnit,
        startHour,
        endHour // 전달
      );
      allFormattedData = result.data.map((d) => ({ ...d, source: 'range' }));
      finalQuery = result.query;
    }

    // AI 분석
    const analysisComment = await generateAnalysisComment(
      deviceId,
      allFormattedData,
      selectedMetric,
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
