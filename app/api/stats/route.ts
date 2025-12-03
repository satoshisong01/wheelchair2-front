// 📍 경로: app/api/stats/route.ts
// 📝 설명: 주행거리는 '최대값'이 아니라 '그 날의 마지막 값(MAX_BY)'을 사용하도록 수정

import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
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

const DATABASE_NAME = 'WheelchairDB';
const TABLE_NAME = 'WheelchairMetricsTable';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

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

    const startTs = `${startDate}T00:00:00Z`;
    const endTs = `${endDate}T23:59:59Z`;

    let whereClause = `time BETWEEN from_iso8601_timestamp('${startTs}') AND from_iso8601_timestamp('${endTs}')`;

    if (deviceId !== 'ALL') {
      whereClause += ` AND (wheelchair_id = '${deviceId}' OR device_serial = '${deviceId}')`;
    }

    // 🟢 [수정] 이상치 필터링( < 20000 ) 제거함 -> 로직으로 해결
    // whereClause += ` AND measure_value::double < 20000`;

    // 5. 쿼리 작성 (⭐️핵심 수정: MAX_BY 사용)
    // MAX_BY(x, y): y(시간)가 가장 클 때의 x(값)를 가져옴 = '마지막 값'
    const query = `
    SELECT 
      BIN(time, 1d) as date_bin,
      measure_name,
      AVG(measure_value::double) as avg_val, 
      MAX_BY(measure_value::double, time) as last_val 
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

    const command = new QueryCommand({ QueryString: query });
    const response = await queryClient.send(command);

    const rows = response.Rows || [];
    const dataMap: Record<string, any> = {};

    rows.forEach((row) => {
      const data = row.Data;
      if (!data) return;

      const timeStr = data[0].ScalarValue?.split(' ')[0];
      const measureName = data[1].ScalarValue;

      const avgVal = parseFloat(data[2].ScalarValue || '0');
      // 🟢 last_val (마지막 값) 추출
      const lastVal = parseFloat(data[3].ScalarValue || '0');

      if (timeStr && measureName) {
        if (!dataMap[timeStr]) {
          dataMap[timeStr] = {
            date: timeStr,
            avgBattery: 0,
            avgSpeed: 0,
            avgDistance: 0,
          };
        }

        // 🟢 [로직 적용]

        // 1. 배터리 (평균)
        if (measureName === 'battery_percent') {
          dataMap[timeStr].avgBattery = parseFloat(avgVal.toFixed(1));
        }
        // 2. 속도 (평균)
        else if (measureName === 'speed' || measureName === 'current_speed') {
          dataMap[timeStr].avgSpeed = parseFloat(avgVal.toFixed(1));
        }
        // 3. 주행거리 -> ⭐️ 그 날의 마지막 값(lastVal) 사용!
        else if (measureName === 'distance' || measureName === 'driving_dist') {
          dataMap[timeStr].avgDistance = parseFloat(lastVal.toFixed(1));
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
