// app/api/wheelchairs/route.ts
// 📝 설명: 최신 DB 구조(JOIN) 조회 (기기 등록은 /api/admin/devices POST — 쓰지 않던 POST는 삭제)

import { NextResponse } from 'next/server';
import * as dotenv from 'dotenv';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import pool from '@/lib/db';
import { logServerError } from '@/lib/server-log';
import { withRequestAudit } from '@/lib/api-audit';

dotenv.config();

// 1. 휠체어 목록 조회 (GET) — 인증 필수 (ADMIN/MASTER만 허용)
async function handleGet() {
  // 🔒 [보안] 인증/인가 체크
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== 'ADMIN' && userRole !== 'MASTER') {
    return NextResponse.json({ message: '접근 권한이 없습니다.' }, { status: 403 });
  }

  try {
    // ⭐️ [핵심 수정] SQL 쿼리: s.light 뒤에 콤마(,) 추가
    const query = `
      SELECT 
        w.id, 
        w.device_serial, 
        w.model_name, 
        w.created_at,
        
        -- 상태 정보 (wheelchair_status 테이블에서 가져옴)
        s.current_battery,
        s.current_speed,
        s.voltage,
        s.current,
        s.runtime,
        s.distance,
        s.total_distance,
        s.posture_time,
        s.operating_time,
        s.is_connected,
        s.last_seen,
        
        -- 위치 정보
        s.latitude,
        s.longitude,
        
        -- 환경/자세 정보
        s.temperature,
        s.humidity,
        s.pressure,
        s.angle_back,
        s.angle_seat,
        s.incline_angle,
        s.foot_angle,
        s.elevation_dist, 
        s.slope_fr, 
        s.slope_side, 
        
        s.light, 
        s.operating_time 

      FROM wheelchairs w
      LEFT JOIN wheelchair_status s ON w.id = s.wheelchair_id
      ORDER BY w.created_at DESC;
    `;

    const result = await pool.query(query); // ⭐️ 에러 발생 지점: 쿼리 실행

    // 프론트엔드 인터페이스에 맞춰 데이터 매핑
    const formattedData = result.rows.map((row) => ({
      id: row.id,
      device_serial: row.device_serial,
      modelName: row.model_name,
      createdAt: row.created_at,

      // status 객체로 묶어서 반환
      // 값 없음(NULL)은 0으로 덮지 않고 그대로 둔다 → 화면에서 '-'로 표시 (실측 0만 0)
      status: {
        current_battery: row.current_battery,
        current_speed: row.current_speed,
        voltage: row.voltage,
        current: row.current,
        runtime: row.runtime,
        distance: row.distance,
        total_distance: row.total_distance,
        posture_time: row.posture_time,
        operating_time: row.operating_time,
        is_connected: row.is_connected ?? false,
        last_seen: row.last_seen,

        // 위치 (없으면 서울 시청 기본값)
        latitude: row.latitude ?? 37.5665,
        longitude: row.longitude ?? 126.978,

        // 기타 센서
        temperature: row.temperature,
        humidity: row.humidity,
        pressure: row.pressure,

        angle_back: row.angle_back,
        angle_seat: row.angle_seat,
        incline_angle: row.incline_angle,
        foot_angle: row.foot_angle,
        elevation_dist: row.elevation_dist,
        slope_fr: row.slope_fr,
        slope_side: row.slope_side,

      },

      registrant: null,
    }));

    // 캐시 방지 헤더 추가 (실시간성 보장)
    return NextResponse.json(formattedData, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    logServerError('API Error', error);
    return NextResponse.json(
      { error: 'Failed to fetch wheelchairs' },
      { status: 500 }
    );
  }
}

// 🔒 [UC-04] 오류 응답(4xx·5xx)은 감사기록 '요청 오류'로 남긴다 (lib/api-audit.ts)
export const GET = withRequestAudit(handleGet);
