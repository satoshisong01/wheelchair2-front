// 📍 경로: app/api/auth/change-password/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import bcrypt from 'bcrypt'; // 🔒 [보안] bcrypt로 일원화 (로그인 검증과 동일 라이브러리)
import { createAuditLog } from '@/lib/log'; // ⭐️ 활동 로그 함수 임포트
import { validatePassword, PASSWORD_POLICY_MESSAGE, BCRYPT_COST } from '@/lib/password'; // 🔒 [IA-05] 비밀번호 강도 검증
import { isLoginLocked, recordLoginFailure, resetLoginFailures } from '@/lib/login-lockout';
import { logServerError, summarizeError } from '@/lib/server-log';
import pool from '@/lib/db';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/validate';

const LOCKED_MESSAGE = '비밀번호 확인 시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.';

// 새 비밀번호 저장 + 초기 비밀번호 플래그 해제(uc_auth_04).
// 2026-10-08 마이그레이션 전 DB(컬럼 없음, 42703)에서는 비밀번호만 저장해 변경 자체는 깨지지 않게 한다
async function saveNewPassword(accountId: string, hashedPassword: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE device_auths
          SET password = $1, must_change_password = false, password_changed_at = NOW()
        WHERE id = $2`,
      [hashedPassword, accountId],
    );
  } catch (error) {
    if ((error as { code?: string }).code !== '42703') throw error;
    await pool.query('UPDATE device_auths SET password = $1 WHERE id = $2', [hashedPassword, accountId]);
  }
}

export async function POST(req: Request) {
  let session: Session | null = null;
  try {
    // 1. 세션 확인
    session = await getServerSession(authOptions);
    const user = session?.user;

    if (!user) {
      return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 });
    }

    // ⛔️ 비밀번호는 기기 계정(device_auths)에만 있음 — 카카오 로그인 관리자는 변경 대상 아님
    //    (KTC 관리자 테스트 계정처럼 role=ADMIN인 기기 계정도 deviceId가 있어 변경 가능)
    if (!user.deviceId) {
      return NextResponse.json(
        { message: '비밀번호 변경 권한이 없는 계정입니다.' },
        { status: 403 },
      );
    }

    const parsed = await parseJsonBody(
      req,
      z.object({
        currentPassword: z.string().min(1).max(200),
        newPassword: z.string().min(1).max(200),
      }),
      '입력 값이 부족합니다.',
    );
    if ('error' in parsed) return parsed.error;
    const { currentPassword, newPassword } = parsed.data;

    // 🔒 [IA-05] 새 비밀번호 강도 검증 (거부 시 어떤 규칙인지 드러내지 않는 단일 문구)
    if (!validatePassword(newPassword).ok) {
      return NextResponse.json({ message: PASSWORD_POLICY_MESSAGE }, { status: 400 });
    }

    // 🔒 [IA-07] 현재 비밀번호 연속 오류 시 잠금 (로그인 잠금과 키 접두어를 달리해 별도 관리)
    const lockKey = `pwchg:${user.id}`;
    if (await isLoginLocked(lockKey)) {
      return NextResponse.json({ message: LOCKED_MESSAGE }, { status: 429 });
    }

    // 2. device_auths 테이블에서 비밀번호 조회 (bcrypt 비교 중에 DB 연결을 붙잡지 않도록 pool.query 사용)
    const userRes = await pool.query('SELECT password FROM device_auths WHERE id = $1', [user.id]);
    if (userRes.rows.length === 0) {
      return NextResponse.json({ message: '계정 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    const storedHash: string = userRes.rows[0].password;

    // 3. 현재 비밀번호 확인
    if (!(await bcrypt.compare(currentPassword, storedHash))) {
      const locked = await recordLoginFailure(lockKey);
      return locked
        ? NextResponse.json({ message: LOCKED_MESSAGE }, { status: 429 })
        : NextResponse.json({ message: '현재 비밀번호가 일치하지 않습니다.' }, { status: 400 });
    }
    await resetLoginFailures(lockKey);

    // 4. 현재와 같은 비밀번호로는 변경 불가
    if (await bcrypt.compare(newPassword, storedHash)) {
      return NextResponse.json(
        { message: '현재 비밀번호와 다른 비밀번호를 입력해주세요.' },
        { status: 400 },
      );
    }

    // 5. 새 비밀번호 업데이트 (+ 초기 비밀번호 플래그 해제·변경 시각 기록)
    await saveNewPassword(user.id, await bcrypt.hash(newPassword, BCRYPT_COST));

    // ⭐️ 비밀번호 변경 성공 로그 기록
    await createAuditLog({
      userId: user.id,
      userRole: user.role,
      action: 'USER_UPDATE',
      details: {
        target: '비밀번호',
        status: 'Success',
        targetUserId: user.id,
        deviceId: user.deviceId, // 로그 추적을 위해 기기 ID 포함
      },
      deviceSerial: user.deviceId, // AuditLog 테이블의 device_serial 필드에도 기록
    });

    return NextResponse.json({ message: '비밀번호가 변경되었습니다.' });
  } catch (error) {
    logServerError('[API/change-password] Error', error);

    // ⭐️ 실패 시 로그 기록 — 위에서 읽은 세션을 재사용(재조회 실패로 기록이 빠지지 않게), 오류 원문 대신 코드만 저장
    const user = session?.user;
    if (user?.id && user.role) {
      const { name, code } = summarizeError(error);
      await createAuditLog({
        userId: user.id,
        userRole: user.role,
        action: 'USER_UPDATE',
        details: {
          target: '비밀번호',
          status: 'Failed',
          errorCode: code ?? name,
        },
        deviceSerial: user.deviceId, // AuditLog 테이블의 device_serial 필드에도 기록
      });
    }

    return NextResponse.json({ message: '서버 에러가 발생했습니다.' }, { status: 500 });
  }
}
