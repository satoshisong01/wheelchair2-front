// 📍 경로: app/api/auth/change-password/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { Pool } from 'pg';
import bcrypt from 'bcrypt'; // 🔒 [보안] bcrypt로 일원화 (로그인 검증과 동일 라이브러리)
import { createAuditLog } from '@/lib/log'; // ⭐️ [추가] 활동 로그 함수 임포트

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function POST(req: Request) {
  try {
    // 1. 세션 확인
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const userRole = (session.user as any).role;
    const deviceId = (session.user as any).deviceId; // 기기 ID (SERIAL)

    // ⛔️ DEVICE_USER가 아니면 비밀번호 변경 불가 (카카오 로그인 등)
    if (userRole !== 'DEVICE_USER') {
      return NextResponse.json(
        { message: '비밀번호 변경 권한이 없는 계정입니다.' },
        { status: 403 },
      );
    }

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ message: '입력 값이 부족합니다.' }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      // 2. device_auths 테이블에서 비밀번호 조회
      const userRes = await client.query('SELECT id, password FROM device_auths WHERE id = $1', [
        userId,
      ]);

      if (userRes.rows.length === 0) {
        return NextResponse.json({ message: '계정 정보를 찾을 수 없습니다.' }, { status: 404 });
      }

      const user = userRes.rows[0];

      // 3. 현재 비밀번호 확인
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return NextResponse.json(
          { message: '현재 비밀번호가 일치하지 않습니다.' },
          { status: 400 },
        );
      }

      // 4. 새 비밀번호 업데이트
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);

      await client.query('UPDATE device_auths SET password = $1 WHERE id = $2', [
        hashedNewPassword,
        userId,
      ]);

      // ⭐️ [핵심 추가] 비밀번호 변경 성공 로그 기록
      await createAuditLog({
        userId: userId,
        userRole: userRole,
        action: 'USER_UPDATE',
        details: {
          target: '비밀번호',
          status: 'Success',
          targetUserId: userId,
          deviceId: deviceId, // 로그 추적을 위해 기기 ID 포함
        },
        deviceSerial: deviceId, // AuditLog 테이블의 device_serial 필드에도 기록
      });

      return NextResponse.json({ message: '비밀번호가 변경되었습니다.' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[API/change-password] Error:', error);

    // ⭐️ [추가] 실패 시 로그 기록
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    const userRole = (session?.user as any)?.role;
    const deviceId = (session?.user as any)?.deviceId;

    if (userId && userRole) {
      await createAuditLog({
        userId: userId,
        userRole: userRole,
        action: 'USER_UPDATE',
        details: {
          target: '비밀번호',
          status: 'Failed',
          error: (error as Error).message.substring(0, 50),
        },
        deviceSerial: deviceId, // AuditLog 테이블의 device_serial 필드에도 기록
      });
    }

    return NextResponse.json({ message: '서버 에러가 발생했습니다.' }, { status: 500 });
  }
}
