// 📍 경로: app/api/stats/route.ts
// 📝 설명: DB에 실제 저장된 이름(battery_percent 등)으로 조회하도록 수정

import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
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

const DATABASE_NAME = 'WheelchairDB';
const TABLE_NAME = 'WheelchairMetricsTable';

export async function GET(request: NextRequest) {
  try {
    // 1. 세션 확인
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 2. 쿼리 파라미터 파싱
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    let deviceId = url.searchParams.get('deviceId');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { message: '날짜 범위가 필요합니다.' },
        { status: 400 }
      );
    }

    // 3. 권한 및 대상 기기 설정
    const userRole = session.user.role;

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

    // 4. Timestream 쿼리 조건 생성
    const startTs = `${startDate}T00:00:00Z`;
    const endTs = `${endDate}T23:59:59Z`;

    // [중요] DB에 wheelchair_id 컬럼(UUID)이 있으므로 이 조건을 사용합니다.
    let whereClause = `time BETWEEN from_iso8601_timestamp('${startTs}') AND from_iso8601_timestamp('${endTs}')`;

    if (deviceId !== 'ALL') {
      whereClause += ` AND (wheelchair_id = '${deviceId}' OR device_serial = '${deviceId}')`;
    }

    // 5. 쿼리 작성 (⭐️수정됨: 실제 DB에 있는 이름들로 조회)
    // battery_percent: 확인됨
    // current_speed, speed: 추측 (둘 다 넣어둠)
    // distance, driving_dist: 추측 (둘 다 넣어둠)
    const query = `
    SELECT 
      BIN(time, 1d) as date_bin,
      measure_name,
      AVG(measure_value::double) as avg_val
    FROM "${DATABASE_NAME}"."${TABLE_NAME}"
    WHERE ${whereClause}
      AND measure_name IN (
        'battery_percent', 
        'speed', 'current_speed', 
        'distance', 'driving_dist'
      )
    GROUP BY BIN(time, 1d), measure_name
    ORDER BY date_bin ASC
   `;

    // console.log('[API /stats] Query:', query);

    // 6. 쿼리 실행
    const command = new QueryCommand({ QueryString: query });
    const response = await queryClient.send(command);

    // 7. 데이터 가공
    const rows = response.Rows || [];
    const dataMap: Record<string, any> = {};

    rows.forEach((row) => {
      const data = row.Data;
      if (!data) return;

      const timeStr = data[0].ScalarValue?.split(' ')[0]; // YYYY-MM-DD
      const measureName = data[1].ScalarValue;
      const avgVal = parseFloat(data[2].ScalarValue || '0');

      if (timeStr && measureName) {
        if (!dataMap[timeStr]) {
          dataMap[timeStr] = {
            date: timeStr,
            avgBattery: 0,
            avgSpeed: 0,
            avgDistance: 0,
          };
        }

        // ⭐️ [매핑 수정] DB 이름 -> 프론트 변수 연결
        if (measureName === 'battery_percent') {
          dataMap[timeStr].avgBattery = parseFloat(avgVal.toFixed(1));
        }
        // 속도 (이름이 불확실하여 여러 케이스 처리)
        else if (measureName === 'speed' || measureName === 'current_speed') {
          dataMap[timeStr].avgSpeed = parseFloat(avgVal.toFixed(1));
        }
        // 거리
        else if (measureName === 'distance' || measureName === 'driving_dist') {
          dataMap[timeStr].avgDistance = parseFloat(avgVal.toFixed(1));
        }
      }
    });

    const formattedData = Object.values(dataMap).sort(
      (a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return NextResponse.json(formattedData);
  } catch (error: any) {
    console.error('[API /stats] Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error', error: error.message },
      { status: 500 }
    );
  }
}
