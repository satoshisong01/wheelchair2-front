// app/api/user/settings/route.ts
import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function POST(req: Request) {
  try {
    // 🟢 req.body.json()이 아니라 req.json()을 사용해야 합니다.
    const { wheelchairId, type, enabled } = await req.json();

    const columnMap: { [key: string]: string } = {
      emergency: 'push_emergency',
      battery: 'push_battery',
      posture: 'push_posture',
    };

    const columnName = columnMap[type];
    if (!columnName) return NextResponse.json({ message: 'Invalid type' }, { status: 400 });

    const query = `UPDATE wheelchair_status SET ${columnName} = $1 WHERE wheelchair_id = $2`;
    await pgPool.query(query, [enabled, wheelchairId]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
