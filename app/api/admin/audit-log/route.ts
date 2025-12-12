// 📍 경로: app/api/admin/audit-log/route.ts (최종 수정 전체 코드)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  // @ts-ignore
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MASTER')) {
    return NextResponse.json({ message: '접근 권한이 없습니다.' }, { status: 403 });
  }

  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  if (!startDate || !endDate) {
    return NextResponse.json({ message: '날짜 범위가 필요합니다.' }, { status: 400 });
  }

  try {
    const startTimestamp = `${startDate} 00:00:00.000`;
    const endTimestamp = `${endDate} 23:59:59.999`;

    // ⭐️ [핵심 수정] SQL 쿼리: 타입 불일치 오류 해결을 위해 명시적 TEXT 캐스팅 적용
    const sql = `
SELECT 
  a.id, a.user_id, a.user_role, a.action, a.details, a.created_at,
  a.device_serial,
  a.user_name AS audit_user_name, 
  u1.name AS linked_user_name, 
  u1.email AS user_email,
  u2.name AS target_user_name,
  u2.email AS target_user_email
FROM admin_audit_logs a
LEFT JOIN users u1 ON 
  (a.user_role != 'DEVICE_USER' AND a.user_id = u1.id::TEXT) -- ⭐️ [수정] u1.id(UUID)를 TEXT로 캐스팅하여 비교
LEFT JOIN users u2 ON (a.details ->> 'targetUserId') = u2.id::TEXT -- ⭐️ [수정] u2.id(UUID)를 TEXT로 캐스팅하여 비교
WHERE a.user_role IN ('ADMIN', 'MASTER', 'DEVICE_USER') 
  AND a.action IN ('LOGIN', 'LOGOUT', 'DEVICE_REGISTER', 'DEVICE_DELETE', 'USER_UPDATE', 'USER_APPROVE', 'USER_REJECT', 'SERVER_ALERT') 
  AND a.created_at BETWEEN $1 AND $2
ORDER BY a.created_at DESC
LIMIT 100
`;

    const result = await query(sql, [startTimestamp, endTimestamp]);

    const enrichedLogs = result.rows.map((log) => {
      let detailsObj = log.details;
      if (typeof detailsObj === 'string') {
        try {
          detailsObj = JSON.parse(detailsObj);
        } catch {}
      }
      detailsObj = detailsObj || {};

      if (log.target_user_name) detailsObj.targetUserName = log.target_user_name;
      if (log.target_user_email) detailsObj.targetUserEmail = log.target_user_email;

      // 최종 행위자 이름 결정
      const finalUserName = log.audit_user_name || log.linked_user_name;

      if (log.user_email) detailsObj.userEmail = log.user_email;

      return {
        ...log,
        details: detailsObj,
        user_name: finalUserName,
      };
    });

    return NextResponse.json(enrichedLogs);
  } catch (error) {
    console.error('Audit Log API Error:', error);
    return NextResponse.json({ message: '활동 로그를 불러오는 데 실패했습니다.' }, { status: 500 });
  }
}
