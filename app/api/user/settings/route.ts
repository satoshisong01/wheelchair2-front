import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth'; // 세션 필수
import { authOptions } from '@/lib/authOptions';
import { Pool } from 'pg';

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 🟢 Body에서 데이터 받기
    const { wheelchairId, type, enabled } = await req.json();

    // 현재 로그인한 사용자 ID (Kakao ID 등)
    // device_auths 테이블의 어떤 컬럼이 사용자 식별자인지에 따라 수정 필요 (여기선 id 혹은 user_id 추정)
    // session.user.email 이나 id를 사용해야 합니다.
    const userId = (session.user as any).id || (session.user as any).email;

    const columnMap: { [key: string]: string } = {
      emergency: 'push_emergency',
      battery: 'push_battery',
      posture: 'push_posture',
    };

    const columnName = columnMap[type];
    if (!columnName) return NextResponse.json({ message: 'Invalid type' }, { status: 400 });

    // 🟢 device_auths 테이블 업데이트 (나의 설정만 변경)
    // 조건: 휠체어 ID + 내 사용자 ID
    const query = `
      UPDATE device_auths 
      SET ${columnName} = $1 
      WHERE wheelchair_id = $2 AND id = $3
    `;

    // ⚠️ 주의: 'id' 컬럼이 사용자 식별자가 맞는지 확인하세요.
    // 만약 device_auths 테이블에 user_email 등이 있다면 그걸 써야 합니다.
    await pgPool.query(query, [enabled, wheelchairId, userId]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
