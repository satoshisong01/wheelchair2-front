// 📍 경로: app/api/admin/users/route.ts (MASTER 가시성 FIX)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, auditAccessDenied } from '@/lib/authOptions';
import { query } from '@/lib/db';
import { createAuditLog } from '@/lib/log'; // 🔒 [F6] 역할 변경 감사 로그
import { logServerError } from '@/lib/server-log';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/validate';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ------------------------------
// GET: PENDING, USER, ADMIN 사용자 목록 조회
// ------------------------------
export async function GET() {
    const session = await getServerSession(authOptions);

    // MASTER 권한 확인
    if (!session || session.user.role !== 'MASTER') {
        await auditAccessDenied(session?.user, 'USER_LIST');
        return NextResponse.json({ message: '접근 권한이 없습니다.' }, { status: 403 });
    }

    try {
        // ⭐️ [FIXED SQL] ADMIN, USER, PENDING 역할을 모두 조회 (MASTER는 자신 제외)
        //    🔒 화면에서 쓰지 않는 email은 응답에서 제외 (승인에 필요한 이름·소속·연락처만)
        const sql = `
            SELECT id, name, organization, phone_number, created_at, role, rejection_reason
            FROM users
            WHERE role IN ('PENDING', 'USER', 'ADMIN', 'REJECTED')
              AND id != $1 -- 현재 MASTER 계정은 목록에서 제외
            ORDER BY created_at ASC
        `;
        const result = await query(sql, [session.user.id]);

        return NextResponse.json(result.rows);
    } catch (error) {
        logServerError('Error fetching users', error);
        return NextResponse.json({ message: '사용자 목록을 불러오는 데 실패했습니다.' }, { status: 500 });
    }
}

// ------------------------------
// PUT: 유저 상태 업데이트 (승인/거절)
// ------------------------------
export async function PUT(req: NextRequest) {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'MASTER') {
        await auditAccessDenied(session?.user, 'USER_ROLE_UPDATE');
        return NextResponse.json({ message: '접근 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const parsed = await parseJsonBody(
            req,
            z.object({
                userId: z.string().regex(UUID_PATTERN),
                newRole: z.string().min(1).max(30),
                rejectionReason: z.string().max(500).nullish(),
            }),
            '필수 필드가 누락되었습니다.',
        );
        if ('error' in parsed) return parsed.error;
        const { userId, newRole, rejectionReason } = parsed.data;

        // 🔒 [보안] 역할 화이트리스트 검증 — MASTER 권한 자동 부여 차단
        const ALLOWED_ROLES = ['ADMIN', 'USER', 'REJECTED', 'PENDING'] as const;
        if (!(ALLOWED_ROLES as readonly string[]).includes(newRole)) {
            return NextResponse.json({ message: '유효하지 않은 역할입니다.' }, { status: 400 });
        }

        // 🔒 자기 자신의 역할은 바꿀 수 없음 (실수로 MASTER 권한을 잃는 것 방지)
        if (userId === session.user.id) {
            return NextResponse.json({ message: '자기 자신의 역할은 변경할 수 없습니다.' }, { status: 403 });
        }

        const rejectionReasonText = newRole === 'REJECTED' ? rejectionReason || '관리자 거절' : null;

        // prev(같은 행의 변경 전 값)를 함께 읽어 감사로그에 이전 역할을 남긴다
        const sql = `
            UPDATE users AS u
            SET
                role = $1,
                rejection_reason = $2,
                updated_at = NOW()
            FROM users AS prev
            WHERE u.id = $3 AND prev.id = u.id
            RETURNING u.id, u.name, u.role, prev.role AS previous_role
        `;

        const result = await query(sql, [newRole, rejectionReasonText, userId]);

        if (result.rowCount === 0) {
            return NextResponse.json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
        }

        // 🔒 [F6] MASTER의 역할 변경(승인/거절)을 감사 로그에 기록 (fail-safe: 실패해도 본 작업 중단 안 함)
        await createAuditLog({
            userId: session.user.id,
            userRole: session.user.role,
            action: 'USER_ROLE_UPDATE',
            details: {
                targetUserId: userId,
                previousRole: result.rows[0].previous_role,
                newRole,
                rejectionReason: rejectionReasonText,
            },
        });

        return NextResponse.json({ message: '사용자 상태가 성공적으로 업데이트되었습니다.' });
    } catch (error) {
        logServerError('Error updating user status', error);
        return NextResponse.json({ message: '사용자 상태 업데이트에 실패했습니다.' }, { status: 500 });
    }
}
