import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions'; 
import { query } from '@/lib/db'; // ⭐️ Raw SQL 헬퍼 임포트

export async function GET(request: NextRequest) {
    
    // 1. 세션 확인 및 역할/ID 추출
    const session = await getServerSession(authOptions);
    // @ts-ignore
    const userId = session?.user?.id;
    // @ts-ignore
    const userRole = session?.user?.role;

    if (!userId) {
        return NextResponse.json({ message: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }

    try {
        let sql: string;
        let params: any[] = [];
        
        // 2. 권한별 SQL 쿼리 로직 분기
        if (userRole === 'ADMIN' || userRole === 'MASTER') {
            // ✅ CASE 1: ADMIN/MASTER -> 모든 휠체어의 알림을 조회
            sql = `
                SELECT a.id, a.type, a.message, a.is_read, a.created_at, w.device_serial
                FROM alarms a
                JOIN wheelchairs w ON a.wheelchair_id = w.id
                ORDER BY a.created_at DESC
            `;
            // params는 비어있음
        } else {
            // ✅ CASE 2: USER -> 자신이 등록한 휠체어의 알림만 조회 (N:M 조인)
            sql = `
                SELECT a.id, a.type, a.message, a.is_read, a.created_at, w.device_serial
                FROM alarms a
                JOIN user_wheelchairs uw ON a.wheelchair_id = uw.wheelchair_id
                JOIN wheelchairs w ON a.wheelchair_id = w.id
                WHERE uw.user_id = $1
                ORDER BY a.created_at DESC
            `;
            params = [userId];
        }

        // 3. 쿼리 실행
        const result = await query(sql, params);

        // 4. 성공 응답 (알림 목록 반환)
        return NextResponse.json(result.rows);

    } catch (error) {
        console.error('❌ Alarm API Failed:', error);
        return NextResponse.json({ message: '알림 목록을 불러오는 데 실패했습니다.' }, { status: 500 });
    }
}