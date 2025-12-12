// 📍 경로: app/api/admin/audit-log/route.ts (수정된 전체 코드)

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

    // ⭐️ [핵심 수정] SQL 쿼리: DEVICE_USER 포함 및 조인 조건 개선
    const sql = `
SELECT 
  a.id, a.user_id, a.user_role, a.action, a.details, a.created_at,
  a.device_serial, -- ⭐️ [추가] DB에서 device_serial 직접 조회
  u1.name AS user_name, 
  u1.email AS user_email,
  u2.name AS target_user_name,
  u2.email AS target_user_email
FROM admin_audit_logs a
LEFT JOIN users u1 ON 
  (a.user_role != 'DEVICE_USER' AND a.user_id = u1.id) -- 행위자가 관리자인 경우에만 users 테이블과 조인
LEFT JOIN users u2 ON (a.details ->> 'targetUserId')::uuid = u2.id -- 타겟 유저 정보는 그대로 조인
WHERE a.user_role IN ('ADMIN', 'MASTER', 'DEVICE_USER') -- ⭐️ [필수 수정] DEVICE_USER 역할 포함
  AND a.action IN ('LOGIN', 'LOGOUT', 'DEVICE_REGISTER', 'DEVICE_DELETE', 'USER_UPDATE', 'USER_APPROVE', 'USER_REJECT')
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

      // ⭐️ [추가] 타겟 유저 정보를 details 객체에 병합하여 프론트로 전달
      if (log.target_user_name) detailsObj.targetUserName = log.target_user_name;
      if (log.target_user_email) detailsObj.targetUserEmail = log.target_user_email;

      // device_serial 및 user_name (행위자) 필드 추가 (DB에서 device_serial을 직접 가져오므로, details를 확인하는 로직 삭제)
      // log.device_serial은 DB 컬럼에서 바로 가져옵니다.

      if (log.user_name) detailsObj.userName = log.user_name;
      if (log.user_email) detailsObj.userEmail = log.user_email;

      return {
        ...log,
        details: detailsObj,
        // user_name이 null이면 null로 전달
        user_name: log.user_name,
      };
    });

    return NextResponse.json(enrichedLogs);
  } catch (error) {
    console.error('Audit Log API Error:', error);
    return NextResponse.json({ message: '활동 로그를 불러오는 데 실패했습니다.' }, { status: 500 });
  }
}
