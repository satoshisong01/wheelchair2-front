// app/api/wheelchairs/route.ts
// 📝 설명: 최신 DB 구조(JOIN) 조회 + 기기 등록(POST) 기능 포함 (최종본)

import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

// 워커와 동일한 DB 설정
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // RDS SSL 옵션
});

// 1. 휠체어 목록 조회 (GET)
export async function GET() {
  try {
    // ⭐️ [핵심] wheelchairs(기기정보) + wheelchair_status(상태) JOIN 쿼리
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
        s.is_connected,
        s.last_seen,
        
        -- 위치 정보
        s.latitude,
        s.longitude,
        
        -- 환경/자세 정보
        s.temperature,
        s.humidity,
        s.angle_back,
        s.angle_seat,
        s.incline_angle,
        s.foot_angle

      FROM wheelchairs w
      LEFT JOIN wheelchair_status s ON w.id = s.wheelchair_id
      ORDER BY w.created_at DESC;
    `;

    const result = await pool.query(query);

    // 프론트엔드 인터페이스에 맞춰 데이터 매핑
    const formattedData = result.rows.map((row) => ({
      id: row.id,
      device_serial: row.device_serial,
      modelName: row.model_name,
      createdAt: row.created_at,

      // status 객체로 묶어서 반환
      status: {
        current_battery: row.current_battery ?? 0,
        current_speed: row.current_speed ?? 0,
        voltage: row.voltage ?? 0,
        current: row.current ?? 0,
        runtime: row.runtime ?? 0,
        distance: row.distance ?? 0,
        is_connected: row.is_connected ?? false,
        last_seen: row.last_seen,

        // 위치 (없으면 서울 시청 기본값)
        latitude: row.latitude ?? 37.5665,
        longitude: row.longitude ?? 126.978,

        // 기타 센서
        temperature: row.temperature,
        humidity: row.humidity,
        angle_back: row.angle_back,
        angle_seat: row.angle_seat,
        incline_angle: row.incline_angle,
        foot_angle: row.foot_angle,
      },

      registrant: null,
    }));

    // 캐시 방지 헤더 추가 (실시간성 보장)
    return NextResponse.json(formattedData, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wheelchairs' },
      { status: 500 }
    );
  }
}

// 2. 휠체어 기기 등록 (POST) - 기존 기능 유지
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { device_serial, model_name } = body;

    // UUID 자동 생성 (gen_random_uuid)
    const query = `
      INSERT INTO wheelchairs (id, device_serial, model_name, created_at)
      VALUES (gen_random_uuid(), $1, $2, NOW())
      RETURNING *
    `;

    const result = await pool.query(query, [device_serial, model_name]);
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Insert Error:', error);
    return NextResponse.json(
      { error: 'Failed to create wheelchair' },
      { status: 500 }
    );
  }
}
