import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user)
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { alarmId, all } = await req.json();
    const wheelchairId = (session.user as any).wheelchairId;

    const client = await pool.connect();
    try {
      if (all) {
        // 전체 확인 처리
        await client.query(
          'UPDATE alarms SET is_resolved = true WHERE wheelchair_id = $1 AND is_resolved = false',
          [wheelchairId],
        );
      } else {
        // 개별 확인 처리
        await client.query(
          'UPDATE alarms SET is_resolved = true WHERE id = $1 AND wheelchair_id = $2',
          [alarmId, wheelchairId],
        );
      }
      return NextResponse.json({ success: true });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('알람 확인 처리 에러:', error);
    return NextResponse.json({ message: 'Server Error' }, { status: 500 });
  }
}
