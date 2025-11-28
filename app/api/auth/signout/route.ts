// 📍 경로: app/api/auth/signout/route.ts (새로 생성 - POST 메서드 사용)

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions'; 
import { createAuditLog } from '@/lib/log'; // 로그 유틸리티 임포트
import { signOut } from 'next-auth/react'; // NextAuth의 signOut 함수를 직접 사용 (선택적)

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (session?.user) {
        // @ts-ignore
        const userId = session.user.id;
        // @ts-ignore
        const userRole = session.user.role;

        // ⭐️ [LOG INJECTION] 로그아웃 로그 기록
        if (userRole === 'ADMIN' || userRole === 'MASTER') {
            await createAuditLog({ 
                userId: userId, 
                userRole: userRole, 
                action: 'LOGOUT', 
                details: { status: 'Success' } 
            });
        }
    }
    
    // NextAuth의 기본 로그아웃 로직(쿠키 삭제 등)은 NextAuth 내부에서 처리되므로,
    // 이 API는 200 OK 응답만 보냅니다.
    // **NextAuth.js가 내부적으로 쿠키를 지우고 리다이렉트합니다.**
    return NextResponse.json({ message: 'Signed out successfully' }, { status: 200 });
}