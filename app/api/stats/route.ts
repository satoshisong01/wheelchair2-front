// 📍 경로: app/api/stats/route.ts
// 📝 설명: UI 기반 POST 요청 처리 및 Gemini AI 분석 멘트 생성 기능 추가 (쿼리 Trim으로 ValidationException 해결)

import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { GoogleGenAI } from '@google/genai';
import {
  TimestreamQueryClient,
  QueryCommand,
} from '@aws-sdk/client-timestream-query';

const queryClient = new TimestreamQueryClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const API_KEY = process.env.GOOGLE_AI_API_KEY || '';
const genAI = new GoogleGenAI({ apiKey: API_KEY });

const DATABASE_NAME = 'WheelchairDB';
const TABLE_NAME = 'WheelchairMetricsTable';
const METRIC_CONFIG: Record<string, any> = {
  // AI 분석 멘트 생성을 위한 임시 설정 (클라이언트 코드와 동일)
  BATTERY: { label: '평균 배터리 잔량' },
  SPEED: { label: '평균 속도' },
  DISTANCE: { label: '주행 거리' },
};

export async function POST(request: NextRequest) {
  console.log('--- [LOG] UI-Based Query Execution API Entered ---');
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const {
      startDate,
      endDate,
      deviceId: requestDeviceId,
      metric: selectedMetric,
      unit: timeUnit,
    } = await request.json();

    if (!startDate || !endDate || !selectedMetric || !timeUnit) {
      return NextResponse.json(
        { message: '필수 요청 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    const userRole = session.user.role;
    let deviceId = requestDeviceId;

    if (userRole === 'DEVICE_USER') {
      // @ts-ignore
      const sessionWcId = session.user.wheelchairId;
      if (!sessionWcId) {
        return NextResponse.json(
          { message: '연동된 기기가 없습니다.' },
          { status: 403 }
        );
      }
      deviceId = String(sessionWcId);
    } else if (userRole === 'ADMIN' || userRole === 'MASTER') {
      if (!deviceId) deviceId = 'ALL';
    } else {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const binUnit = timeUnit === 'hourly' ? '1h' : '1d';
    const measureNames = [
      'battery_percent',
      'speed',
      'current_speed',
      'distance',
      'driving_dist',
    ];
    const startTs = `${startDate}T00:00:00Z`;
    const endTs = `${endDate}T23:59:59Z`;

    let whereClause = `time BETWEEN from_iso8601_timestamp('${startTs}') AND from_iso8601_timestamp('${endTs}')`;

    if (deviceId !== 'ALL') {
      whereClause += ` AND (wheelchair_id = '${deviceId}' OR device_serial = '${deviceId}')`;
    }

    const query = `
        SELECT 
          BIN(time, ${binUnit}) as date_bin,
          measure_name,
          AVG(measure_value::double) as avg_val, 
          MAX_BY(measure_value::double, time) as last_val 
        FROM "${DATABASE_NAME}"."${TABLE_NAME}"
        WHERE ${whereClause}
          AND measure_name IN (${measureNames
            .map((name) => `'${name}'`)
            .join(', ')})
        GROUP BY BIN(time, ${binUnit}), measure_name
        ORDER BY date_bin ASC
       `; // ⭐️ [수정] 쿼리 전송 전에 .trim() 메서드를 사용하여 구문 오류를 방지합니다.

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
      const lastVal = parseFloat(data[3].ScalarValue || '0');

      if (timeStr && measureName) {
        if (!dataMap[timeStr]) {
          dataMap[timeStr] = {
            date: timeStr,
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
        } else if (
          measureName === 'distance' ||
          measureName === 'driving_dist'
        ) {
          dataMap[timeStr].avgDistance = parseFloat(lastVal.toFixed(1));
        }
      }
    });

    const formattedData = Object.values(dataMap).sort(
      (a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let analysisComment = 'AI 분석을 시작합니다.';
    try {
      if (
        formattedData.length > 0 &&
        selectedMetric === 'BATTERY' &&
        deviceId !== 'ALL'
      ) {
        const dataJsonString = JSON.stringify(formattedData, null, 2);
        const prompt = `
                    당신은 휠체어 데이터 분석가입니다. 다음 JSON 데이터 배열을 분석하여 
                    기기 ${deviceId}의 ${startDate}부터 ${endDate}까지 **배터리 잔량(avgBattery)** 변화에 대한 
                    **가장 중요한 패턴과 인사이트**를 한국어로 작성해주세요.
                    
                    분석 시 다음 조건을 고려하여 상세하게 멘트를 작성하세요:
                    1. 데이터는 ${binUnit} 단위입니다.
                    2. 기간 전체의 **평균 배터리 잔량**을 언급하세요.
                    3. **기간의 시작 시점과 마지막 시점의 배터리 잔량**을 비교하여 유의미한 변화(하락/상승)가 있는지 언급하고, 그 추세를 전문적인 문체로 분석하세요.
                    4. **(핵심)** 데이터가 1년 전 동기 대비 비교 데이터라는 가정 하에 (예: 작년 12월 8일 100%->95%, 올해 12월 8일 100%->90%), 현재 데이터만으로도 사용 습관의 변화나 **성능 저하 여부**를 추측하여 멘트를 구성하세요. (예: "작년 동기 대비 비교가 필요하지만, 일일 충전 후 평균 잔량 감소 속도가 빨라진 것으로 보아 배터리 성능 저하 가능성이 있습니다.")

                    [분석할 데이터 배열 (객체 키: date, avgBattery, avgSpeed, avgDistance, lastBattery)]:
                    ${dataJsonString}
                    
                    [분석 결과 멘트]:
                    - **5줄 내외**의 간결하고 전문적인 문체로 작성하세요.
                    - Markdown(예: **볼드체**)을 사용하여 주요 수치를 강조하세요.
                `;
        const aiResult = await genAI.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        analysisComment = aiResult.text.trim();
      } else if (selectedMetric !== 'BATTERY') {
        analysisComment = `${
          METRIC_CONFIG[selectedMetric]?.label || selectedMetric
        } 분석 기능은 곧 추가될 예정입니다. 현재는 그래프를 통해 추세를 확인해주세요.`;
      } else if (deviceId === 'ALL') {
        analysisComment =
          'AI 심층 분석은 **개별 기기** 선택 시 제공됩니다. 전체 평균 데이터만으로는 유의미한 분석이 어렵습니다.';
      } else {
        analysisComment =
          '선택하신 기간에 유효한 데이터가 충분하지 않아 AI 분석을 진행할 수 없습니다.';
      }
    } catch (error) {
      console.error('Gemini Analysis Error:', error);
      analysisComment =
        'AI 분석 서버에 문제가 발생했습니다. 관리자에게 문의하세요.';
    }

    return NextResponse.json({
      data: formattedData,
      comment: analysisComment,
      query: trimmedQuery, // 디버깅용 쿼리
    });
  } catch (error: any) {
    console.error('[API /stats] Error:', error);
    return NextResponse.json(
      {
        message: 'Internal Server Error',
        error: error.message,
        data: [],
        comment: `서버 오류 발생: ${error.message}. AWS/Timestream 설정을 확인하세요.`,
      },
      { status: 500 }
    );
  }
}
