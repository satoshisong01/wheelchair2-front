// app/api/admin/users/[id]/route.ts
// (화면에서 쓰지 않던 상세 조회 GET은 노출면을 줄이기 위해 삭제 — user-management는 목록 GET과 PATCH만 사용)
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, auditAccessDenied } from '@/lib/authOptions';
import { query } from '@/lib/db'; // ✅ 공용 DB 연결 도구 사용
import { createAuditLog } from '@/lib/log'; // ✅ 공용 로그 도구 사용
import { logServerError, summarizeError } from '@/lib/server-log';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/validate';

// Next.js 15+ 라우트 파라미터 타입
interface RouteParams {
  params: Promise<{ id: string }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 1. 역할 변경 (PATCH) - 승인/거절
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params; // 타겟 유저 ID

  // 1. 세션 확인
  const session = await getServerSession(authOptions);
  const currentUserRole = session?.user?.role;
  const currentUserId = session?.user?.id;

  // 권한 체크: MASTER만 가능
  if (!session || currentUserRole !== 'MASTER') {
    await auditAccessDenied(session?.user, 'USER_ROLE_UPDATE');
    return NextResponse.json(
      { message: '접근 권한이 없습니다.' },
      { status: 403 }
    );
  }

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ message: '잘못된 요청입니다.' }, { status: 400 });
  }

  // 🔒 자기 자신의 역할은 바꿀 수 없음 (실수로 MASTER 권한을 잃는 것 방지)
  if (id === currentUserId) {
    return NextResponse.json(
      { message: '자기 자신의 역할은 변경할 수 없습니다.' },
      { status: 403 }
    );
  }

  const parsed = await parseJsonBody(
    request,
    z.object({
      role: z.string().min(1).max(50),
      reason: z.string().max(500).nullish(), // 거절 사유 상한은 PUT과 같게 500자
    }),
    '유효하지 않은 역할입니다.',
  );
  if ('error' in parsed) return parsed.error;
  const { role, reason } = parsed.data; // role: 'ADMIN' or 'REJECTED'

  // 🔒 [보안] 역할 화이트리스트 검증 — MASTER 권한 자동 부여 차단
  const ALLOWED_ROLES = ['ADMIN', 'USER', 'REJECTED', 'PENDING'] as const;
  if (!role || !(ALLOWED_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json(
      { message: '유효하지 않은 역할입니다.' },
      { status: 400 }
    );
  }

  try {
    // 2. DB 업데이트 (Raw SQL) — prev(같은 행의 변경 전 값)를 함께 읽어 감사로그에 이전 역할을 남긴다
    const updateSql = `
      UPDATE users AS u
      SET role = $1
      FROM users AS prev
      WHERE u.id = $2 AND prev.id = u.id
      RETURNING prev.role AS previous_role
    `;
    const updated = await query(updateSql, [role, id]);
    if (updated.rowCount === 0) {
      return NextResponse.json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 거절 사유 저장 (옵션 - 컬럼 없으면 무시됨)
    if (role === 'REJECTED' && reason) {
      try {
        await query(`UPDATE users SET rejection_reason = $1 WHERE id = $2`, [
          reason,
          id,
        ]);
      } catch (e) {
        logServerError('거절 사유 저장 실패', e);
      }
    }

    // 3. 감사 로그 기록
    await createAuditLog({
      userId: currentUserId,
      userRole: currentUserRole,
      action: role === 'REJECTED' ? 'USER_REJECT' : 'USER_APPROVE',
      details: {
        targetUserId: id,
        previousRole: updated.rows[0].previous_role,
        newRole: role,
        reason: reason || '',
      },
    });

    return NextResponse.json({ message: 'Success' });
  } catch (error) {
    logServerError('[API] 회원 역할 변경 실패', error);
    // 처리 실패도 감사기록 (오류 원문 대신 코드만)
    const { name, code } = summarizeError(error);
    await createAuditLog({
      userId: currentUserId,
      userRole: currentUserRole,
      action: 'USER_ROLE_UPDATE_FAILED',
      details: { targetUserId: id, newRole: role, status: 'Failed', errorCode: code ?? name },
    });
    return NextResponse.json({ message: 'Server Error' }, { status: 500 });
  }
}

// 2. 삭제 (DELETE)
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'MASTER') {
      await auditAccessDenied(session.user, 'USER_DELETE');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
    }

    // 삭제 실행
    const result = await query('DELETE FROM users WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 로그 기록
    await createAuditLog({
      userId: session.user.id,
      userRole: session.user.role,
      action: 'USER_DELETE',
      details: { targetUserId: id },
    });

    return NextResponse.json({ message: 'User deleted' });
  } catch (error) {
    logServerError('User Delete Error', error);
    return NextResponse.json({ error: 'Delete Failed' }, { status: 500 });
  }
}
