// app/api/my-wheelchair/route.ts
// 📝 설명: TypeORM 제거, Raw SQL 적용, 기기 사용자 전용 통합 데이터 조회

import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET(request: Request) {
  try {
    // 1. 사용자 인증 확인
    const session = await getServerSession(authOptions);
    if (
      !session ||
      !session.user ||
      session.user.role !== 'DEVICE_USER' ||
      !session.user.dbUserId
    ) {
      return NextResponse.json(
        { error: 'Unauthorized: 기기 사용자로 로그인되지 않았습니다.' },
        { status: 401 }
      );
    }

    const userId = session.user.dbUserId;

    // 2. 내 휠체어 ID 찾기 (device_auths 테이블 조회)
    // (DEVICE_USER는 device_auths 테이블을 통해 wheelchair와 연결됨)
    const findIdQuery = `
      SELECT wheelchair_id FROM device_auths WHERE user_id = $1 LIMIT 1
    `;
    const idResult = await pool.query(findIdQuery, [userId]);

    if (idResult.rows.length === 0) {
      return NextResponse.json(
        { error: '연결된 휠체어 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const myWheelchairId = idResult.rows[0].wheelchair_id;

    // 3. [병렬 조회] 휠체어 정보(+상태), 알람, 정비이력 동시에 조회 (속도 최적화)
    const [wcResult, alarmsResult, logsResult] = await Promise.all([
      // (A) 휠체어 기본 정보 + 최신 상태 JOIN
      pool.query(
        `
        SELECT 
          w.id, w.device_serial, w.model_name, w.created_at,
          s.current_battery, s.current_speed, s.voltage, s.current,
          s.latitude, s.longitude, s.is_connected, s.last_seen,
          s.temperature, s.humidity, s.angle_back, s.angle_seat,
          s.incline_angle, s.foot_angle, s.runtime, s.distance
        FROM wheelchairs w
        LEFT JOIN wheelchair_status s ON w.id = s.wheelchair_id
        WHERE w.id = $1
      `,
        [myWheelchairId]
      ),

      // (B) 알람 내역 (최신순)
      pool.query(
        `
        SELECT * FROM alarms 
        WHERE wheelchair_id = $1 
        ORDER BY alarm_time DESC
      `,
        [myWheelchairId]
      ),

      // (C) 정비 이력 (최신순)
      pool.query(
        `
        SELECT * FROM maintenance_logs 
        WHERE wheelchair_id = $1 
        ORDER BY created_at DESC
      `,
        [myWheelchairId]
      ),
    ]);

    if (wcResult.rows.length === 0) {
      return NextResponse.json({ error: 'Data not found' }, { status: 404 });
    }

    const wcRow = wcResult.rows[0];

    // 4. 데이터 조립 (프론트엔드 호환성 유지: camelCase 변환)
    const responseData = {
      id: wcRow.id,
      deviceSerial: wcRow.device_serial,
      modelName: wcRow.model_name,
      createdAt: wcRow.created_at,

      // 상태 객체 Nesting
      status: {
        current_battery: wcRow.current_battery ?? 0,
        current_speed: wcRow.current_speed ?? 0,
        voltage: wcRow.voltage ?? 0,
        current: wcRow.current ?? 0,
        latitude: wcRow.latitude,
        longitude: wcRow.longitude,
        is_connected: wcRow.is_connected,
        last_seen: wcRow.last_seen,
        temperature: wcRow.temperature,
        angleBack: wcRow.angle_back,
        angleSeat: wcRow.angle_seat,
        inclineAngle: wcRow.incline_angle,
        footAngle: wcRow.foot_angle,
        runtime: wcRow.runtime,
        distance: wcRow.distance,
      },

      // 알람 리스트 매핑 (snake -> camel)
      alarms: alarmsResult.rows.map((row) => ({
        id: row.id,
        wheelchairId: row.wheelchair_id,
        alarmType: row.alarm_type,
        message: row.alarm_condition, // or row.message
        alarmStatus: row.alarm_status,
        alarmTime: row.alarm_time,
        createdAt: row.created_at,
      })),

      // 정비 이력 매핑 (snake -> camel)
      maintenanceLogs: logsResult.rows.map((row) => ({
        id: row.id,
        wheelchairId: row.wheelchair_id,
        reportDate: row.report_date,
        description: row.description,
        technician: row.technician,
        createdAt: row.created_at,
      })),
    };

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error('[API /my-wheelchair] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
