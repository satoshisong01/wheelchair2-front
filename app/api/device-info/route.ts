import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET(req: Request) {
  let client;
  try {
    // 1. 세션 및 권한 확인
    const session = await getServerSession(authOptions);

    if (!session || !session.user || (session.user as any).role !== 'DEVICE_USER') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;
    const wheelchairId = user.wheelchairId; // 기기 고유 ID (UUID)
    const userId = user.id || user.email; // 사용자 계정 식별자

    if (!wheelchairId) {
      return NextResponse.json({ message: '기기 정보가 없습니다.' }, { status: 404 });
    }

    client = await pool.connect();

    // 2. 휠체어 기본 정보 및 실시간 상태(날씨, 배터리, 설정값, 마지막 자세 각도 등) 조회
    const deviceInfoQuery = `
      SELECT 
        w.device_serial,
        ws.outdoor_temp,
        ws.weather_desc,
        ws.humidity,
        ws.pressure,
        ws.distance,
        ws.total_distance,
        ws.runtime,
        ws.temperature as sensor_temp,
        ws.current_battery,
        ws.angle_back,
        ws.angle_seat,
        ws.foot_angle,
        ws.elevation_dist,
        ws.slope_fr,
        ws.slope_side,
        ws.latitude,
        ws.longitude,
        ws.is_connected,
        ws.last_seen,
        da.push_emergency,
        da.push_battery,
        da.push_posture,
        COALESCE(pd.count, 0) AS ulcer_count
      FROM wheelchairs w
      JOIN device_auths da ON w.id = da.wheelchair_id
      LEFT JOIN wheelchair_status ws ON w.id = ws.wheelchair_id
      LEFT JOIN posture_daily pd ON pd.wheelchair_id = w.id AND pd.date = CURRENT_DATE
      WHERE w.id = $1 AND da.id = $2
    `;

    const deviceRes = await client.query(deviceInfoQuery, [wheelchairId, userId]);

    if (deviceRes.rows.length === 0) {
      return NextResponse.json({ serial: null, status: null, alarms: [] });
    }

    const row = deviceRes.rows[0];

    // 3. 해당 기기(wheelchair_id)의 최근 알람 내역 20건 조회
    // 확인된 컬럼명 반영: id, alarm_type, alarm_condition, is_read, alarm_time, alarm_status, is_resolved
    const alarmQuery = `
      SELECT 
        id, 
        alarm_type, 
        alarm_condition, 
        is_read, 
        alarm_time, 
        alarm_status, 
        is_resolved 
      FROM alarms 
      WHERE wheelchair_id = $1 
      ORDER BY alarm_time DESC 
      LIMIT 100
    `;

    const alarmRes = await client.query(alarmQuery, [wheelchairId]);

    // 4. 데이터 정제 및 최종 반환
    return NextResponse.json({
      serial: row.device_serial,
      alarms: alarmRes.rows, // DB에서 조회한 실제 알람 리스트
      status: {
        distance: row.distance,
        total_distance: row.total_distance,
        runtime: row.runtime,
        outdoor_temp: row.outdoor_temp,
        weather_desc: row.weather_desc,
        humidity: row.humidity,
        pressure: row.pressure,
        // 알림 설정값
        push_emergency: row.push_emergency,
        push_battery: row.push_battery,
        push_posture: row.push_posture,
        // 센서 및 통계 데이터
        temperature: row.sensor_temp,
        current_battery: row.current_battery,
        ulcer_count: Number(row.ulcer_count ?? 0),
        ulcerCount: Number(row.ulcer_count ?? 0),
        // GPS 좌표
        latitude: row.latitude,
        longitude: row.longitude,
        // 연결 상태 및 마지막 통신 시간
        is_connected: row.is_connected,
        last_seen: row.last_seen,
        // 마지막 저장된 자세/각도 정보 (휠체어가 운행 중이 아니어도 유지)
        angle_back: row.angle_back,
        angle_seat: row.angle_seat,
        foot_angle: row.foot_angle,
        elevation_dist: row.elevation_dist,
        slope_fr: row.slope_fr,
        slope_side: row.slope_side,
      },
    });
  } catch (error) {
    console.error('🚨 [API] 기기 정보 조회 에러:', error);
    return NextResponse.json({ message: 'Server Error' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
