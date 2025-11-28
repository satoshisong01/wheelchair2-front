import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions'; // ⭐️ 수정된 경로 사용
import { query } from '@/lib/db'; // Raw SQL 헬퍼 임포트

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
        
        // 2. 권한별 SQL 쿼리 로직 분기 (MASTER/ADMIN은 전체, USER는 본인 휠체어만)
        if (userRole === 'ADMIN' || userRole === 'MASTER') {
            // ✅ CASE 1: ADMIN/MASTER -> 모든 휠체어와 연결된 사용자 정보를 조회
            sql = `
                SELECT 
                    w.id, w.device_serial, w.model_name, w.status, w.created_at,
                    u.name AS user_name, u.email AS user_email
                FROM wheelchairs w
                LEFT JOIN user_wheelchairs uw ON w.id = uw.wheelchair_id
                LEFT JOIN users u ON uw.user_id = u.id
                ORDER BY w.created_at DESC
            `;
            // params는 비어있음
        } else {
            // ✅ CASE 2: USER -> 자신이 등록한 휠체어만 조회 (N:M 조인)
            sql = `
                SELECT 
                    w.id, w.device_serial, w.model_name, w.status, w.created_at,
                    u.name AS user_name, u.email AS user_email
                FROM wheelchairs w
                JOIN user_wheelchairs uw ON w.id = uw.wheelchair_id
                JOIN users u ON uw.user_id = u.id
                WHERE uw.user_id = $1
                ORDER BY w.created_at DESC
            `;
            params = [userId];
        }

        // 3. 쿼리 실행
        const result = await query(sql, params);

        // 4. 데이터 매핑 및 그룹화
        // Raw SQL 결과는 중복되므로, 휠체어 ID 기준으로 데이터를 그룹화합니다.
        const wheelchairsMap = new Map();

        for (const row of result.rows) {
            if (!wheelchairsMap.has(row.id)) {
                wheelchairsMap.set(row.id, {
                    id: row.id,
                    device_serial: row.device_serial,
                    model_name: row.model_name,
                    status: row.status,
                    created_at: row.created_at,
                    users: [],
                });
            }
            // 사용자 정보가 있을 경우 추가 (GROUP_BY 역할)
            if (row.user_name) {
                wheelchairsMap.get(row.id).users.push({
                    name: row.user_name,
                    email: row.user_email,
                });
            }
        }

        // 5. 성공 응답 (배열로 변환)
        return NextResponse.json(Array.from(wheelchairsMap.values()));

    } catch (error) {
        console.error('❌ Wheelchair List API Failed:', error);
        return NextResponse.json({ message: '휠체어 목록을 불러오는 데 실패했습니다.' }, { status: 500 });
    }
}