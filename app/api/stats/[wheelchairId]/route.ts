// app/api/stats/[wheelchairId]/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import {
  TimestreamQueryClient,
  QueryCommand,
} from '@aws-sdk/client-timestream-query';

// 1. Timestream 클라이언트 설정
const queryClient = new TimestreamQueryClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const DATABASE_NAME = 'WheelchairDB'; // Timestream DB 이름 (환경에 맞게 확인 필요)
const TABLE_NAME = 'WheelchairMetricsTable'; // Timestream 테이블 이름 (환경에 맞게 확인 필요)

export async function GET(
  request: Request,
  context: { params: Promise<{ wheelchairId: string }> }
) {
  try {
    // 0. Next.js 15/16 호환성: params를 await로 풀어서 사용
    const { wheelchairId } = await context.params;
    const targetId = parseInt(wheelchairId, 10);

    if (isNaN(targetId)) {
      return NextResponse.json({ message: 'Invalid ID' }, { status: 400 });
    }

    // 1. 세션 확인
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 2. [권한 검사] DB 조회(UserWheelchair) 제거하고 세션 기반 검사로 변경
    const userRole = session.user.role;

    // A. 기기 사용자(DEVICE_USER): 본인 ID와 요청 ID가 같은지 확인
    if (userRole === 'DEVICE_USER') {
      if (session.user.wheelchairId !== targetId) {
        return NextResponse.json(
          { message: 'Forbidden: 본인의 데이터만 조회 가능' },
          { status: 403 }
        );
      }
    }
    // B. 관리자(ADMIN, MASTER): 통과 (모든 데이터 조회 가능)
    else if (userRole !== 'ADMIN' && userRole !== 'MASTER') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // 3. 쿼리 파라미터 파싱 (기간 설정)
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '1d'; // 기본값 1일

    let timeExpression = 'ago(1d)';
    let binInterval = '1h'; // 그래프 포인트 간격

    switch (range) {
      case '1h':
        timeExpression = 'ago(1h)';
        binInterval = '5m';
        break;
      case '1d':
        timeExpression = 'ago(1d)';
        binInterval = '1h';
        break;
      case '1w':
        timeExpression = 'ago(7d)';
        binInterval = '1d';
        break;
      case '1m':
        timeExpression = 'ago(30d)';
        binInterval = '1d';
        break;
      default:
        timeExpression = 'ago(1d)';
    }

    // 4. Timestream 쿼리 작성
    // (주의: 실제 Timestream에 데이터가 쌓여 있어야 그래프가 나옵니다)
    const queryString = `
      SELECT 
        BIN(time, ${binInterval}) as time_bin,
        AVG(measure_value::double) as avg_val,
        measure_name
      FROM "${DATABASE_NAME}"."${TABLE_NAME}"
      WHERE wheelchair_id = '${targetId}'
        AND time > ${timeExpression}
        AND measure_name IN ('BAT', 'SPD', 'DST') 
      GROUP BY BIN(time, ${binInterval}), measure_name
      ORDER BY time_bin ASC
    `;

    // 5. 쿼리 실행
    const command = new QueryCommand({ QueryString: queryString });
    const response = await queryClient.send(command);

    // 6. 데이터 포맷팅 (Chart.js용)
    const labels: string[] = [];
    const batteryData: number[] = [];
    const speedData: number[] = [];
    const distanceData: number[] = [];

    // Timestream 결과 파싱
    const rows = response.Rows || [];
    const dataMap: Record<
      string,
      { BAT?: number; SPD?: number; DST?: number }
    > = {};

    rows.forEach((row) => {
      const data = row.Data;
      if (!data) return;

      const timeStr = data[0].ScalarValue; // time_bin
      const valStr = data[1].ScalarValue; // avg_val
      const nameStr = data[2].ScalarValue; // measure_name

      if (timeStr && valStr && nameStr) {
        if (!dataMap[timeStr]) dataMap[timeStr] = {};

        if (nameStr === 'BAT') dataMap[timeStr].BAT = parseFloat(valStr);
        if (nameStr === 'SPD') dataMap[timeStr].SPD = parseFloat(valStr);
        if (nameStr === 'DST') dataMap[timeStr].DST = parseFloat(valStr);
      }
    });

    // 맵을 배열로 변환
    Object.keys(dataMap)
      .sort()
      .forEach((time) => {
        const date = new Date(time);
        const label =
          range === '1h' || range === '1d'
            ? date.toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : date.toLocaleDateString('ko-KR', {
                month: 'numeric',
                day: 'numeric',
              });

        labels.push(label);
        batteryData.push(dataMap[time].BAT || 0);
        speedData.push(dataMap[time].SPD || 0);
        distanceData.push(dataMap[time].DST || 0);
      });

    return NextResponse.json({
      labels,
      battery: batteryData,
      speed: speedData,
      distance: distanceData,
    });
  } catch (error: any) {
    console.error('[API/Stats] Error:', error);
    // 에러가 나도 500 페이지 대신 에러 JSON을 반환하여 프론트엔드가 처리하게 함
    return NextResponse.json(
      { message: 'Internal Server Error', error: error.message },
      { status: 500 }
    );
  }
}
