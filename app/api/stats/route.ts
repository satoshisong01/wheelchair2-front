// 📍 경로: app/api/stats/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions'; // 올바른 경로 사용
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

// 🚨 환경에 맞게 확인 필요 (현재 .env.local 값 기준)
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
  const startDate = url.searchParams.get('startDate'); // YYYY-MM-DD
  const endDate = url.searchParams.get('endDate'); // YYYY-MM-DD
  let deviceId = url.searchParams.get('deviceId'); // 'ALL' or '123'

  if (!startDate || !endDate) {
   return NextResponse.json(
    { message: '날짜 범위가 필요합니다.' },
    { status: 400 }
   );
  }

  // 3. 권한 및 대상 기기 설정
    // ⭐️ [FIXED] ADMIN 역할도 허용하도록 수정
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
  } 
    // ⭐️ ADMIN 또는 MASTER 허용
    else if (userRole === 'ADMIN' || userRole === 'MASTER') {
   if (!deviceId) deviceId = 'ALL';
  } 
    else {
   // USER, GUEST, PENDING 등 기타 역할은 거부
   return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  // 4. Timestream 쿼리 조건 생성
  const startTs = `${startDate}T00:00:00Z`;
  const endTs = `${endDate}T23:59:59Z`;

  let whereClause = `time BETWEEN from_iso8601_timestamp('${startTs}') AND from_iso8601_timestamp('${endTs}')`;

  if (deviceId !== 'ALL') {
   whereClause += ` AND wheelchair_id = '${deviceId}'`;
  }

  // 5. 쿼리 작성
  const query = `
   SELECT 
    BIN(time, 1d) as date_bin,
    measure_name,
    AVG(measure_value::double) as avg_val,
    MAX(measure_value::double) as max_val
   FROM "${DATABASE_NAME}"."${TABLE_NAME}"
   WHERE ${whereClause}
    AND measure_name IN ('BAT', 'DST')
   GROUP BY BIN(time, 1d), measure_name
   ORDER BY date_bin ASC
  `;

  console.log('[API /stats] Query:', query);

  // 6. 쿼리 실행
  const command = new QueryCommand({ QueryString: query });
  const response = await queryClient.send(command);

  // 7. 데이터 가공
  const rows = response.Rows || [];
  const dataMap: Record<string, any> = {};

  rows.forEach((row) => {
   const data = row.Data;
   if (!data) return;

   // Timestream 결과값 추출
   const timeStr = data[0].ScalarValue?.split(' ')[0];
   const measureName = data[1].ScalarValue;
   const avgVal = parseFloat(data[2].ScalarValue || '0');

   if (timeStr && measureName) {
    if (!dataMap[timeStr]) {
     dataMap[timeStr] = { date: timeStr, avgBattery: 0, distance: 0 };
    }

    if (measureName === 'BAT') {
     dataMap[timeStr].avgBattery = Math.round(avgVal);
    } else if (measureName === 'DST') {
     dataMap[timeStr].distance = parseFloat(avgVal.toFixed(2));
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