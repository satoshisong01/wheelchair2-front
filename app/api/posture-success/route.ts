/**
 * 2분 유지 달성 시 욕창 예방 카운트 증가 API
 * - wheelchairs.today_success_count, last_reset_date (일별 리셋)
 * - wheelchair_status.ulcer_count 동기화 (기기별 표시용)
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
      // 1. 오늘 날짜 기준으로 리셋 후 카운트 +1 (wheelchairs)
      const updateWheelchair = await client.query(
        `UPDATE wheelchairs
         SET today_success_count = CASE
           WHEN last_reset_date IS NULL OR last_reset_date < CURRENT_DATE THEN 1
           ELSE today_success_count + 1
         END,
         last_reset_date = CURRENT_DATE
         WHERE id = $1
         RETURNING today_success_count`,
        [wheelchairId]
      );

      if (updateWheelchair.rows.length === 0) {
        return NextResponse.json({ message: '휠체어를 찾을 수 없습니다.' }, { status: 404 });
      }

      const newCount = Number(updateWheelchair.rows[0].today_success_count);

      // 2. wheelchair_status.ulcer_count 동기화 (기기별 조회용)
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
