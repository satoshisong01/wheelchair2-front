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

    const wheelchairId = (session.user as any).wheelchairId;

    if (!wheelchairId) {
      return NextResponse.json({ message: '기기 정보가 없습니다.' }, { status: 404 });
    }

    const client = await pool.connect();
    try {
      // 2. wheelchairs + wheelchair_status + posture_daily(오늘 예방 횟수)
      const queryText = `
        SELECT 
          w.device_serial,
          ws.outdoor_temp,
          ws.weather_desc,
          ws.humidity,
          ws.pressure,
          ws.distance,
          ws.runtime,
          ws.push_emergency,
          ws.push_battery,
          ws.push_posture,
          ws.temperature as sensor_temp,
          ws.current_battery,
          COALESCE(pd.count, 0) AS ulcer_count
        FROM wheelchairs w
        LEFT JOIN wheelchair_status ws ON w.id = ws.wheelchair_id
        LEFT JOIN posture_daily pd ON pd.wheelchair_id = w.id AND pd.date = CURRENT_DATE
        WHERE w.id = $1
      `;

      const res = await client.query(queryText, [wheelchairId]);

      if (res.rows.length === 0) {
        return NextResponse.json({ serial: null, status: null });
      }

      const row = res.rows[0];

      // 오늘 예방 횟수: posture_daily에서 오늘 날짜 행만 조회 → 없으면 0
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
