// 📍 경로: app/api/admin/users/route.ts (MASTER 가시성 FIX)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions'; 
import { query } from '@/lib/db'; 

// ------------------------------
// GET: PENDING, USER, ADMIN 사용자 목록 조회
// ------------------------------
export async function GET() {
    const session = await getServerSession(authOptions);

    // MASTER 권한 확인
    // @ts-ignore
    if (!session || session.user.role !== 'MASTER') {
        return NextResponse.json({ message: '접근 권한이 없습니다.' }, { status: 403 });
    }

    try {
        // ⭐️ [FIXED SQL] ADMIN, USER, PENDING 역할을 모두 조회 (MASTER는 자신 제외)
        const sql = `
            SELECT id, email, name, organization, phone_number, created_at, role, rejection_reason
            FROM users
            WHERE role IN ('PENDING', 'USER', 'ADMIN', 'REJECTED') 
              AND id != $1 -- 현재 MASTER 계정은 목록에서 제외
            ORDER BY created_at ASC
        `;
        // @ts-ignore
        const result = await query(sql, [session.user.id]); 
        
        return NextResponse.json(result.rows); 
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ message: '사용자 목록을 불러오는 데 실패했습니다.' }, { status: 500 });
    }
}

// ------------------------------
// PUT: 유저 상태 업데이트 (승인/거절)
// ------------------------------
// (로그를 기록해야 하지만, Audit Log 함수가 별도 파일이므로 여기서는 DB 업데이트만 집중)
export async function PUT(req: NextRequest) {
    const session = await getServerSession(authOptions);

    // @ts-ignore
    if (!session || session.user.role !== 'MASTER') {
        return NextResponse.json({ message: '접근 권한이 없습니다.' }, { status: 403 });
    }

    try {
        const { userId, newRole, rejectionReason } = await req.json();

        if (!userId || !newRole) {
            return NextResponse.json({ message: '필수 필드가 누락되었습니다.' }, { status: 400 });
        }
        
        const rejectionReasonText = newRole === 'REJECTED' ? rejectionReason || '관리자 거절' : null;

        const sql = `
            UPDATE users
            SET 
                role = $1, 
                rejection_reason = $2, 
                updated_at = NOW()
            WHERE id = $3
            RETURNING id, name, role
        `;
        
        const result = await query(sql, [newRole, rejectionReasonText, userId]);
        
        if (result.rowCount === 0) {
            return NextResponse.json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
        }
        
        return NextResponse.json({ message: '사용자 상태가 성공적으로 업데이트되었습니다.' });
    } catch (error) {
        console.error('Error updating user status:', error);
        return NextResponse.json({ message: '사용자 상태 업데이트에 실패했습니다.' }, { status: 500 });
    }
}