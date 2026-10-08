/**
 * 관리자용 욕창 예방(35° 2분 유지) 날짜별 횟수 조회
 * GET ?wheelchairId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD  → 단일 기기: [{ date, count }]
 * GET ?wheelchairId=ALL&from=YYYY-MM-DD&to=YYYY-MM-DD  → 전체 조회: [{ wheelchair_id, device_serial, date, count }]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import pool from '@/lib/db';
import { logServerError } from '@/lib/server-log';

// 🔒 [입력검증] 형식·범위 화이트리스트 (그 외 값은 DB 형변환 오류(500) 대신 400)
const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
// 조회 기간 상한 — 전체 조회는 기기 수 × 일수만큼 행이 늘어나므로 1년(+윤일)으로 제한
const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

// YYYY-MM-DD 형식이고, from ≤ to 이며, 기간이 상한 이내인지
function isValidRange(from: string, to: string): boolean {
  if (!DATE_REGEX.test(from) || !DATE_REGEX.test(to)) return false;
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  return days >= 0 && days <= MAX_RANGE_DAYS;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;

    if (!session || (role !== 'ADMIN' && role !== 'MASTER')) {
      return NextResponse.json({ message: '권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const wheelchairId = searchParams.get('wheelchairId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json(
        { message: 'from, to 가 필요합니다.' },
        { status: 400 }
      );
    }
    if (!isValidRange(from, to)) {
      return NextResponse.json({ message: '조회 기간이 올바르지 않습니다.' }, { status: 400 });
    }

    const isFullQuery = !wheelchairId || wheelchairId === 'ALL';

    if (!isFullQuery && !UUID_REGEX.test(wheelchairId)) {
      return NextResponse.json(
        { message: 'wheelchairId 형식이 올바르지 않습니다.' },
        { status: 400 }
      );
    }

    if (isFullQuery) {
      // 전체 조회: 기기별·날짜별 횟수 (wheelchairs JOIN)
      const res = await pool.query(
        `SELECT pd.wheelchair_id, COALESCE(w.device_serial, pd.wheelchair_id::text) AS device_serial, pd.date, pd.count
         FROM posture_daily pd
         LEFT JOIN wheelchairs w ON w.id = pd.wheelchair_id
         WHERE pd.date >= $1::date AND pd.date <= $2::date
         ORDER BY device_serial ASC, pd.date ASC`,
        [from, to]
      );

      const rows = res.rows.map((r) => ({
        wheelchair_id: String(r.wheelchair_id),
        device_serial: r.device_serial ?? String(r.wheelchair_id),
        date: r.date,
        count: Number(r.count ?? 0),
      }));

      return NextResponse.json(rows);
    }

    // 단일 기기 조회
    const res = await pool.query(
      `SELECT date, count
       FROM posture_daily
       WHERE wheelchair_id = $1 AND date >= $2::date AND date <= $3::date
       ORDER BY date ASC`,
      [wheelchairId, from, to]
    );

    const rows = res.rows.map((r) => ({
      date: r.date,
      count: Number(r.count ?? 0),
    }));

    return NextResponse.json(rows);
  } catch (error) {
    logServerError('admin ulcer-history error', error);
    return NextResponse.json({ message: 'Server Error' }, { status: 500 });
  }
}
