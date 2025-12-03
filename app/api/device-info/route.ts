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
    if (
      !session ||
      !session.user ||
      (session.user as any).role !== 'DEVICE_USER'
    ) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const wheelchairId = (session.user as any).wheelchairId;

    if (!wheelchairId) {
      return NextResponse.json(
        { message: '기기 정보가 없습니다.' },
        { status: 404 }
      );
    }

    const client = await pool.connect();
    try {
      // 2. wheelchairs 테이블에서 시리얼 번호 조회
      const res = await client.query(
        'SELECT device_serial FROM wheelchairs WHERE id = $1',
        [wheelchairId]
      );

      if (res.rows.length === 0) {
        return NextResponse.json({ serial: null });
      }

      // 시리얼 번호 반환
      return NextResponse.json({ serial: res.rows[0].device_serial });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('기기 정보 조회 에러:', error);
    return NextResponse.json({ message: 'Server Error' }, { status: 500 });
  }
}
