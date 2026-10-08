import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { query } from '@/lib/db';
import { createAuditLog } from '@/lib/log';
import { logServerError } from '@/lib/server-log';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/validate';

// 전화번호: 숫자와 + - ( ) . 공백만, 7~20자
const PHONE_PATTERN = /^[0-9+\-(). ]{7,20}$/;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ message: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }

    const parsed = await parseJsonBody(
      req,
      z.object({
        name: z.string().min(1).max(100),
        organization: z.string().min(1).max(200),
        phoneNumber: z.string().min(1).max(50),
      }),
      '필수 값이 누락되었습니다.',
    );
    if ('error' in parsed) return parsed.error;
    const { name, organization } = parsed.data;
    const phoneNumber = parsed.data.phoneNumber.trim();
    if (!PHONE_PATTERN.test(phoneNumber)) {
      return NextResponse.json(
        { message: '전화번호는 숫자와 +, -, 괄호, 공백만 사용해 7~20자로 입력해주세요.' },
        { status: 400 },
      );
    }

    // 1. DB 업데이트 (GUEST/REJECTED -> PENDING)
    //    🔒 가입 신청 전 상태(GUEST·REJECTED)에서만 허용 — 승인된 관리자가 이 API로 자기 역할을 PENDING으로 바꾸지 못하게.
    //    prev(같은 행의 변경 전 값)를 함께 읽어 감사로그에 이전 역할을 남긴다
    const sql = `
      UPDATE users AS u
      SET
        name = $1,
        organization = $2,
        phone_number = $3,
        role = 'PENDING',
        updated_at = NOW()
      FROM users AS prev
      WHERE u.id = $4 AND prev.id = u.id AND u.role IN ('GUEST', 'REJECTED')
      RETURNING prev.role AS previous_role
    `;

    // 2. 쿼리 실행
    const result = await query(sql, [name, organization, phoneNumber, userId]);

    if (result.rowCount === 0) {
      // 계정이 없거나(세션 만료 등) 이미 신청·승인된 상태
      return NextResponse.json(
        { message: '가입 신청을 처리할 수 없는 계정 상태입니다.' },
        { status: 409 },
      );
    }

    // 가입 신청(역할 변경) 감사기록 — 신청자(GUEST·REJECTED)는 감사로그 저장 역할이 아니어서 SYSTEM으로 남김
    await createAuditLog({
      userId,
      userRole: 'SYSTEM',
      action: 'USER_ROLE_UPDATE',
      details: {
        targetUserId: userId,
        previousRole: result.rows[0].previous_role,
        newRole: 'PENDING',
        via: 'profile-submit',
      },
    });

    // 3. 200 OK 응답 반환 (클라이언트에게 세션 갱신 신호를 보냄)
    return NextResponse.json({ success: true, newRole: 'PENDING' }, { status: 200 });

  } catch (error) {
    logServerError('[API] 프로필 업데이트 실패', error);
    return NextResponse.json({ message: '서버 내부 오류가 발생했습니다.' }, { status: 500 });
  }
}
