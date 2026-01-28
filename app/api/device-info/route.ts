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
      // 2. wheelchairs(시리얼)와 wheelchair_status(날씨, 설정) 테이블 JOIN 조회
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
          ws.current_battery
        FROM wheelchairs w
        LEFT JOIN wheelchair_status ws ON w.id = ws.wheelchair_id
        WHERE w.id = $1
      `;

      const res = await client.query(queryText, [wheelchairId]);

      if (res.rows.length === 0) {
        return NextResponse.json({ serial: null, status: null });
      }

      const row = res.rows[0];

      // 프론트엔드 형식에 맞춰 반환
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
