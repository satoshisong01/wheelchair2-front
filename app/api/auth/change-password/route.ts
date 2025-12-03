import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function POST(req: Request) {
  try {
    // 1. 세션 확인
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json(
        { message: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const userId = (session.user as any).id;
    const userRole = (session.user as any).role;

    // ⛔️ DEVICE_USER가 아니면 비밀번호 변경 불가 (카카오 로그인 등)
    if (userRole !== 'DEVICE_USER') {
      return NextResponse.json(
        { message: '비밀번호 변경 권한이 없는 계정입니다.' },
        { status: 403 }
      );
    }

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { message: '입력 값이 부족합니다.' },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    try {
      // 2. device_auths 테이블에서 비밀번호 조회
      // 📝 수정: users -> device_auths
      const userRes = await client.query(
        'SELECT id, password FROM device_auths WHERE id = $1',
        [userId]
      );

      if (userRes.rows.length === 0) {
        return NextResponse.json(
          { message: '계정 정보를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      const user = userRes.rows[0];

      // 3. 현재 비밀번호 확인
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return NextResponse.json(
          { message: '현재 비밀번호가 일치하지 않습니다.' },
          { status: 400 }
        );
      }

      // 4. 새 비밀번호 업데이트
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);

      // 📝 수정: users -> device_auths
      await client.query(
        'UPDATE device_auths SET password = $1 WHERE id = $2',
        [hashedNewPassword, userId]
      );

      return NextResponse.json({ message: '비밀번호가 변경되었습니다.' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[API/change-password] Error:', error);
    return NextResponse.json(
      { message: '서버 에러가 발생했습니다.' },
      { status: 500 }
    );
  }
}
