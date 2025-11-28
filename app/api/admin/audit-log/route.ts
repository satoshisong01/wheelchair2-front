// app/api/admin/audit-log/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions'; 
import { query } from '@/lib/db'; 

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);

    // 권한 확인 (생략)
    // ...

    const url = new URL(req.url);
    const startDate = url.searchParams.get('startDate'); 
    const endDate = url.searchParams.get('endDate');   

    if (!startDate || !endDate) {
        return NextResponse.json({ message: '날짜 범위가 필요합니다.' }, { status: 400 });
    }

    try {
        const startTimestamp = `${startDate} 00:00:00.000`;
        const endTimestamp = `${endDate} 23:59:59.999`;

        // ⭐️ created_at 필드를 포함하여, wheelchairId를 기준으로 device_serial을 조인합니다.
        const sql = `
            SELECT 
                a.id, a.user_id, a.user_role, a.action, a.details, a.created_at, -- created_at 포함
                w.device_serial 
            FROM admin_audit_logs a
            LEFT JOIN wheelchairs w ON (a.details ->> 'wheelchairId')::uuid = w.id 
            WHERE a.user_role = 'ADMIN' 
              AND a.action IN ('LOGIN', 'LOGOUT', 'DEVICE_REGISTER', 'DEVICE_DELETE', 'USER_UPDATE')
              AND a.created_at BETWEEN $1 AND $2
            ORDER BY a.created_at DESC
            LIMIT 100
        `;
        
        const result = await query(sql, [startTimestamp, endTimestamp]);
        
        // ⭐️ 데이터 변환: device_serial을 details 객체에 추가하여 프런트엔드에서 쉽게 접근하도록 합니다.
        const enrichedLogs = result.rows.map(log => {
            let detailsObj = log.details;
            if (typeof detailsObj === 'string') {
                try { detailsObj = JSON.parse(detailsObj); } catch {}
            }
            
            if (log.device_serial) {
                detailsObj = detailsObj || {};
                detailsObj.deviceSerial = log.device_serial; // serial 추가
            }
            
            return {
                ...log,
                details: detailsObj,
            };
        });

        return NextResponse.json(enrichedLogs);
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        return NextResponse.json({ message: '로그를 불러오는 데 실패했습니다.' }, { status: 500 });
    }
}