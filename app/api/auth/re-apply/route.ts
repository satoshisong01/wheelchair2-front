// app/api/auth/re-apply/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions'; // 올바른 경로 사용
import { query } from '@/lib/db'; // Raw SQL 헬퍼 임포트
import { createAuditLog } from '@/lib/log';
import { logServerError } from '@/lib/server-log';

// POST: 재신청 (REJECTED -> GUEST)
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);

    // @ts-ignore
    const userId = session?.user?.id;
    // @ts-ignore
    const userRole = session?.user?.role;

    if (!userId) {
        return NextResponse.json({ message: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }

    // REJECTED 사용자만 재신청 가능하도록 제한
    if (userRole !== 'REJECTED') {
        return NextResponse.json({ message: '이미 승인되었거나 승인 대기 중인 계정입니다.' }, { status: 400 });
    }

    try {
        // ⭐️ Raw SQL: 역할을 GUEST로 변경하고 거절 사유를 NULL로 초기화
        // 🔒 세션 역할은 로그인 시점 값이므로 DB의 현재 역할이 REJECTED일 때만 변경
        //    (이미 승인·대기 중인 계정이 오래된 세션으로 GUEST로 되돌려지는 것 방지)
        const sql = `
            UPDATE users
            SET 
                role = 'GUEST', 
                rejection_reason = NULL,
                updated_at = NOW()
            WHERE id = $1 AND role = 'REJECTED'
            RETURNING id;
        `;
        
        const result = await query(sql, [userId]);
        
        if (result.rowCount === 0) {
            return NextResponse.json({ message: '이미 승인되었거나 승인 대기 중인 계정입니다.' }, { status: 400 });
        }
        
        // 🔒 [감사] 본인 역할 변경(REJECTED→GUEST) 기록 — 가입 흐름 이벤트라 SYSTEM 역할로 남기고 실제 역할은 details.actorRole에 둠
        await createAuditLog({
            userId,
            userRole: 'SYSTEM',
            action: 'USER_REAPPLY',
            details: { targetUserId: userId, actorRole: userRole, previousRole: 'REJECTED', newRole: 'GUEST' },
        });

        // 🚨 Note: 클라이언트에서 세션을 업데이트(update)하여 최신 역할을 받아야 합니다.
        return NextResponse.json({ message: '재신청 처리가 완료되었습니다. 프로필을 재작성해주세요.' });
    } catch (error) {
        logServerError('Error during re-apply', error);
        return NextResponse.json({ message: '재신청 처리 중 서버 오류가 발생했습니다.' }, { status: 500 });
    }
}