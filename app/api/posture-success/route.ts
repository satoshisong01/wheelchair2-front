/**
 * 2분 유지 달성 시 욕창 예방 카운트 증가 API
 *
 * ⚠️ 프론트엔드는 더 이상 이 API를 호출하지 않습니다.
 * 2분 유지 로직·카운트 반영은 서버 worker에서 처리하고,
 * wheelchair_status_update(ulcer_count)로 클라이언트에 전달합니다.
 * (이 라우트는 worker에서 호출하거나, 동일 로직을 worker에 두고 사용할 수 있음)
 *
 * - posture_daily: 기기당 하루 1행, 같은 날이면 count만 +1 (UPSERT)
 * - wheelchair_status.ulcer_count 동기화 (화면 표시용)
 *
 * DB 테이블 생성 (한 번만 실행):
 * CREATE TABLE IF NOT EXISTS posture_daily (
 *   wheelchair_id uuid NOT NULL REFERENCES wheelchairs(id),
 *   date date NOT NULL,
 *   count integer NOT NULL DEFAULT 0,
 *   PRIMARY KEY (wheelchair_id, date)
 * );
 * -- wheelchairs.id가 integer면 uuid → integer 로 바꾸세요.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || (session.user as any).role !== 'DEVICE_USER') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const wheelchairId = (session.user as any).wheelchairId;
    if (!wheelchairId) {
      return NextResponse.json({ message: '기기 정보가 없습니다.' }, { status: 404 });
    }

    const client = await pool.connect();
    try {
      // 1. posture_daily: 기기당 하루 1행, 오늘 행이 있으면 count+1, 없으면 (오늘, 1) INSERT
      const upsert = await client.query(
        `INSERT INTO posture_daily (wheelchair_id, date, count)
         VALUES ($1, CURRENT_DATE, 1)
         ON CONFLICT (wheelchair_id, date) DO UPDATE SET count = posture_daily.count + 1
         RETURNING count`,
        [wheelchairId]
      );

      const newCount = Number(upsert.rows[0]?.count ?? 0);

      // 2. wheelchair_status.ulcer_count 동기화 (화면 표시용)
      await client.query(
        `UPDATE wheelchair_status SET ulcer_count = $2 WHERE wheelchair_id = $1`,
        [wheelchairId, newCount]
      );

      return NextResponse.json({ ulcerCount: newCount });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('posture-success API error:', error);
    return NextResponse.json({ message: 'Server Error' }, { status: 500 });
  }
}
