import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    // 1. 세션 및 기기 사용자 여부 확인
    if (!session || !session.user || (session.user as any).role !== 'DEVICE_USER') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;
    const wheelchairId = user.wheelchairId;
    // device_auths 테이블의 PK(id) 또는 식별자(email/kakao_id)를 가져옵니다.
    // authOptions에서 session.user.id에 device_auths의 id를 넣어줬다고 가정합니다.
    const userId = user.id || user.email;

    if (!wheelchairId) {
      return NextResponse.json({ message: '기기 정보가 없습니다.' }, { status: 404 });
    }

    const client = await pool.connect();
    try {
      // 2. wheelchairs + device_auths(내 설정값) + wheelchair_status(기기 상태) + posture_daily
      // 🟢 변경점: ws.push_* 대신 da.push_* (내 설정)를 가져옵니다.
      const queryText = `
        SELECT 
          w.device_serial,
          ws.outdoor_temp,
          ws.weather_desc,
          ws.humidity,
          ws.pressure,
          ws.distance,
          ws.runtime,
          ws.temperature as sensor_temp,
          ws.current_battery,
          da.push_emergency,  -- 🟢 내 계정의 긴급 알림 설정
          da.push_battery,    -- 🟢 내 계정의 배터리 알림 설정
          da.push_posture,    -- 🟢 내 계정의 자세 알림 설정
          COALESCE(pd.count, 0) AS ulcer_count
        FROM wheelchairs w
        JOIN device_auths da ON w.id = da.wheelchair_id -- 사용자와 연결 확인
        LEFT JOIN wheelchair_status ws ON w.id = ws.wheelchair_id
        LEFT JOIN posture_daily pd ON pd.wheelchair_id = w.id AND pd.date = CURRENT_DATE
        WHERE w.id = $1 AND da.id = $2
      `;

      // $2 자리에 userId를 넣어 내 설정을 조회합니다.
      const res = await client.query(queryText, [wheelchairId, userId]);

      if (res.rows.length === 0) {
        return NextResponse.json({ serial: null, status: null });
      }

      const row = res.rows[0];

      // 오늘 예방 횟수
      const ulcerCount = Number(row.ulcer_count ?? 0);

      return NextResponse.json({
        serial: row.device_serial,
        status: {
          distance: row.distance,
          runtime: row.runtime,
          outdoor_temp: row.outdoor_temp,
          weather_desc: row.weather_desc,
          humidity: row.humidity,
          pressure: row.pressure,

          // 🟢 DB(device_auths)에서 가져온 내 설정값 반환
          push_emergency: row.push_emergency,
          push_battery: row.push_battery,
          push_posture: row.push_posture,

          temperature: row.sensor_temp,
          current_battery: row.current_battery,
          ulcer_count: ulcerCount,
          ulcerCount,
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('기기 정보 조회 에러:', error);
    return NextResponse.json({ message: 'Server Error' }, { status: 500 });
  }
}
