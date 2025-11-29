// 📍 경로: app/api/admin/audit-log/route.ts (Final Data Enrichment)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  // ... (권한 확인 생략) ...

  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  // ... (날짜 유효성 검사 생략) ...

  try {
    const startTimestamp = `${startDate} 00:00:00.000`;
    const endTimestamp = `${endDate} 23:59:59.999`;

    // ⭐️ [FIXED SQL] users 테이블을 user_id로 조인하여 user_name을 가져옵니다.
    const sql = `
            SELECT 
                a.id, a.user_id, a.user_role, a.action, a.details, a.created_at,
                w.device_serial,
                u.name AS user_name,  -- ⭐️ 등록자 이름 필드 추가
                u.email AS user_email
            FROM admin_audit_logs a
            LEFT JOIN wheelchairs w ON (a.details ->> 'wheelchairId')::uuid = w.id 
            LEFT JOIN users u ON a.user_id = u.id -- ⭐️ users 테이블 조인
            WHERE a.user_role = 'ADMIN' 
              AND a.action IN ('LOGIN', 'LOGOUT', 'DEVICE_REGISTER', 'DEVICE_DELETE', 'USER_UPDATE')
              AND a.created_at BETWEEN $1 AND $2
            ORDER BY a.created_at DESC
            LIMIT 100
        `;

    const result = await query(sql, [startTimestamp, endTimestamp]);

    // ⭐️ [DATA ENRICHMENT] 데이터 객체에 name과 serial을 포함시킵니다.
    const enrichedLogs = result.rows.map((log) => {
      let detailsObj = log.details;
      if (typeof detailsObj === 'string') {
        try {
          detailsObj = JSON.parse(detailsObj);
        } catch {}
      }
      detailsObj = detailsObj || {};

      // device_serial 및 user_name 필드 추가
      if (log.device_serial) detailsObj.deviceSerial = log.device_serial;
      if (log.user_name) detailsObj.userName = log.user_name;
      if (log.user_email) detailsObj.userEmail = log.user_email;

      return {
        ...log,
        details: detailsObj,
        user_name: log.user_name, // 프런트엔드에서 쉽게 사용하도록 별도 제공
      };
    });

    return NextResponse.json(enrichedLogs);
  } catch (error) {
    // ... (에러 처리) ...
  }
}
