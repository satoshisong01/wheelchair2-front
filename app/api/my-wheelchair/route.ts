// app/api/my-wheelchair/route.ts
// 📝 설명: 정비 이력(maintenance_logs) 완전 제거, 권한 체크 완화

import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { getDbSslOption } from '@/lib/db';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: getDbSslOption(),
});

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    // 1. 로그인 체크
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized: 로그인이 필요합니다.' }, { status: 401 });
    }

    // 2. 휠체어 ID 찾기
    const user = session.user as any;
    let myWheelchairId = null;

    // 기기 유저인 경우
    if (user.role === 'DEVICE_USER' && user.dbUserId) {
      const findIdQuery = `SELECT wheelchair_id FROM device_auths WHERE user_id = $1 LIMIT 1`;
      const idResult = await pool.query(findIdQuery, [user.dbUserId]);
      if (idResult.rows.length > 0) {
        myWheelchairId = idResult.rows[0].wheelchair_id;
      }
    }
    // 관리자/일반 유저인 경우
    else if (user.wheelchairId) {
      myWheelchairId = user.wheelchairId;
    }

    // 🔒 [보안] IDOR 방지 - 휠체어 ID를 찾지 못하면 404 응답 (이전엔 ID=1로 폴백되어 타 사용자 데이터 노출 위험)
    if (!myWheelchairId) {
      console.warn(`[my-wheelchair] 사용자(${user.dbUserId})에게 연결된 휠체어 없음`);
      return NextResponse.json(
        { error: '연결된 휠체어를 찾을 수 없습니다.' },
        { status: 404 },
      );
    }

    // 3. [병렬 조회] 휠체어 정보(+상태), 알람 조회 (정비이력 제외됨)
    const [wcResult, alarmsResult] = await Promise.all([
      // (A) 휠체어 정보 + 상태
      pool.query(
        `
        SELECT 
          w.id, w.device_serial, w.model_name, w.created_at,
          s.current_battery, s.current_speed, s.voltage, s.current,
          s.latitude, s.longitude, s.is_connected, s.last_seen,
          s.temperature, s.humidity, s.angle_back, s.angle_seat,
          s.incline_angle, s.foot_angle, s.runtime, s.distance, s.total_distance,
          s.posture_time, s.operating_time
        FROM wheelchairs w
        LEFT JOIN wheelchair_status s ON w.id = s.wheelchair_id
        WHERE w.id = $1
      `,
        [myWheelchairId],
      ),

      // (B) 알람 내역
      pool
        .query(`SELECT * FROM alarms WHERE wheelchair_id = $1 ORDER BY alarm_time DESC`, [
          myWheelchairId,
        ])
        .catch(() => ({ rows: [] })), // 알람 테이블 없어도 에러 안 나게 처리
    ]);

    // 데이터가 없으면 빈 껍데기 반환 (값 없음은 0이 아니라 null → 화면에서 '-' 표시)
    if (wcResult.rows.length === 0) {
      return NextResponse.json({
        id: myWheelchairId,
        status: { current_battery: null, latitude: 37.5665, longitude: 126.978 },
        alarms: [],
      });
    }

    const wcRow = wcResult.rows[0];

    // 4. 응답 데이터 조립 (maintenanceLogs 제거됨)
    const responseData = {
      id: wcRow.id,
      deviceSerial: wcRow.device_serial,
      modelName: wcRow.model_name,
      createdAt: wcRow.created_at,

      status: {
        // 값 없음(NULL)은 0으로 덮지 않고 그대로 둔다 → 화면에서 '-'로 표시 (실측 0만 0)
        current_battery: wcRow.current_battery,
        current_speed: wcRow.current_speed,
        voltage: wcRow.voltage,
        current: wcRow.current,
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

      alarms: (alarmsResult as any).rows.map((row: any) => ({
        id: row.id,
        wheelchairId: row.wheelchair_id,
        alarmType: row.alarm_type,
        message: row.alarm_condition,
        alarmStatus: row.alarm_status,
        alarmTime: row.alarm_time,
        createdAt: row.created_at,
      })),

      // 🟢 maintenanceLogs 필드 삭제 완료
    };

    return NextResponse.json(responseData);
  } catch (error: unknown) {
    // 🔒 [보안] 내부 에러 상세는 서버 로그에만, 클라이언트에는 일반 메시지만 노출
    console.error('[API /my-wheelchair] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
