// app/api/admin/users/[id]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { query } from '@/lib/db'; // ✅ 공용 DB 연결 도구 사용
import { createAuditLog } from '@/lib/log'; // ✅ 공용 로그 도구 사용
import { z } from 'zod';
import { parseJsonBody } from '@/lib/validate';

// Next.js 15+ 라우트 파라미터 타입
interface RouteParams {
  params: Promise<{ id: string }>;
}

// 1. 상세 조회 (GET)
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    // @ts-ignore
    if (!session || session.user.role !== 'MASTER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // 유저 정보 조회
    const sql = `
      SELECT id, email, name, role, created_at, phone_number, organization
      FROM users
      WHERE id = $1
    `;
    const result = await query(sql, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('User Detail Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// 2. 역할 변경 (PATCH) - 승인/거절
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params; // 타겟 유저 ID

    // 1. 세션 확인
    const session = await getServerSession(authOptions);

    // @ts-ignore
    const currentUserRole = session?.user?.role;
    // @ts-ignore
    const currentUserId = session?.user?.id;

    // 권한 체크: MASTER만 가능
    if (!session || currentUserRole !== 'MASTER') {
      console.error(`❌ [API] 권한 거부됨. 요청자: ${currentUserRole}`);
      return NextResponse.json(
        { message: '접근 권한이 없습니다.' },
        { status: 403 }
      );
    }

    const parsed = await parseJsonBody(
      request,
      z.object({
        role: z.string().min(1).max(50),
        reason: z.string().max(10000).nullish(),
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

    console.log(`🔄 [API] 유저(${id}) 상태 변경 요청: ${role}`);

    // 2. DB 업데이트 (Raw SQL)
    const updateSql = `
      UPDATE users
      SET role = $1
      WHERE id = $2
    `;
    await query(updateSql, [role, id]);

    // 거절 사유 저장 (옵션 - 컬럼 없으면 무시됨)
    if (role === 'REJECTED' && reason) {
      try {
        await query(`UPDATE users SET rejection_reason = $1 WHERE id = $2`, [
          reason,
          id,
        ]);
      } catch (e) {
        console.warn('거절 사유 저장 실패 (컬럼 없음):', e);
      }
    }

    // 3. 감사 로그 기록
    await createAuditLog({
      userId: currentUserId,
      userRole: currentUserRole,
      action: role === 'REJECTED' ? 'USER_REJECT' : 'USER_APPROVE',
      details: {
        targetUserId: id,
        newRole: role,
        reason: reason || '',
      },
    });

    console.log(`✅ [API] 변경 완료.`);
    return NextResponse.json({ message: 'Success' });
  } catch (error) {
    console.error('❌ [API] PATCH 에러:', error);
    return NextResponse.json({ message: 'Server Error' }, { status: 500 });
  }
}

// 3. 삭제 (DELETE)
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    // @ts-ignore
    if (!session || session.user.role !== 'MASTER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // 삭제 실행
    await query('DELETE FROM users WHERE id = $1', [id]);

    // 로그 기록
    // @ts-ignore
    await createAuditLog({
      // @ts-ignore
      userId: session.user.id,
      // @ts-ignore
      userRole: session.user.role,
      action: 'USER_DELETE',
      details: { targetUserId: id },
    });

    return NextResponse.json({ message: 'User deleted' });
  } catch (error) {
    console.error('User Delete Error:', error);
    return NextResponse.json({ error: 'Delete Failed' }, { status: 500 });
  }
}
