// app/api/admin/audit-log/route.ts (Prisma 제거 완료)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { query } from '@/lib/db'; // ⭐️ [FIXED] Raw SQL (pg) import

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);

    // 1. MASTER 권한 확인
    // @ts-ignore
    if (!session || session.user.role !== 'MASTER') {
        return NextResponse.json({ message: '접근 권한이 없습니다.' }, { status: 403 });
    }

    try {
        // ⭐️ [FIXED SQL] ADMIN이 수행한 로그인, 로그아웃, 기기 관련 로그만 조회
        const sql = `
            SELECT id, user_id, user_role, action, details, created_at
            FROM admin_audit_logs
            WHERE user_role = 'ADMIN' 
              AND action IN ('LOGIN', 'LOGOUT', 'DEVICE_REGISTER', 'DEVICE_DELETE', 'DEVICE_UPDATE')
            ORDER BY created_at DESC
            LIMIT 100
        `;
        
        const result = await query(sql);
        const logs = result.rows; // pg는 snake_case로 컬럼을 반환

        return NextResponse.json(logs);
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        return NextResponse.json({ message: '로그를 불러오는 데 실패했습니다.' }, { status: 500 });
    }
}