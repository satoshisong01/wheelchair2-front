// 📍 경로: app/api/admin/audit-log/route.ts (최종 수정 전체 코드)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/authOptions';
import { query } from '@/lib/db';
import { createAuditLog, getAuditCategory, inferAuditOutcome } from '@/lib/log';
import { logServerError } from '@/lib/server-log';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100; // 기존 LIMIT 100 상한 유지
const MAX_PAGE = 10000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// 조회 기준 시각(asOf) — 첫 조회 응답 값을 그대로 돌려받으므로 아래 SQL to_char 형식만 허용
const AS_OF_FORMAT = 'YYYY-MM-DD HH24:MI:SS.USOF';
const AS_OF_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}[+-]\d{2}(:\d{2})?$/;

// 형식(YYYY-MM-DD)과 실제 달력 날짜(예: 02-30 차단)를 확인 — 잘못된 값이 DB 캐스팅 오류(500)로 가지 않게
const isCalendarDate = (value: string): boolean => {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const querySchema = z.object({
  startDate: z.string().refine(isCalendarDate),
  endDate: z.string().refine(isCalendarDate),
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  asOf: z.string().regex(AS_OF_PATTERN).optional(), // 없으면 첫 조회 — 서버가 DB 현재 시각으로 정함
  includeFcm: z.enum(['true', 'false']).optional(), // 'true'면 FCM_SEND(워커 푸시 발송 기록)도 포함
});

// 목록·건수 공통 조건: 날짜 범위($1~$2) + 조회 기준 시각($3) 이전 + FCM_SEND 제외($4=true면 포함).
//   FCM_SEND는 워커가 푸시 1건마다 남기는 발송 기록이라 양이 많아 기본 목록에서 뺀다(action이 빈 옛 기록은 남도록 IS DISTINCT FROM)
const LIST_FILTER_SQL = `a.created_at BETWEEN $1 AND $2 AND a.created_at <= $3
  AND ($4::boolean OR a.action IS DISTINCT FROM 'FCM_SEND')`;

// details(json)를 객체로 정규화. 문자열 파싱 실패는 원문을 보존하고, 탐지되도록 로그 ID만 경고로 남김(내용 미출력)
function toDetailsObject(raw: unknown, logId: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      console.warn('⚠️ [audit-log] details 파싱 실패 — 원문 유지', { logId: String(logId) });
      return { text: raw, _parseError: true };
    }
    return { text: raw };
  }
  return raw === null || raw === undefined ? {} : { text: JSON.stringify(raw) };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  // 🔒 [uc_log_06] 미인증은 401, 권한 없음은 403으로 구분
  if (!session?.user) {
    return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { id: userId, role: userRole } = session.user;
  // 🔒 열람은 MASTER 전용(메뉴·사용설명서와 동일). 거부된 시도도 열람 시도로 감사 기록
  if (userRole !== 'MASTER') {
    await createAuditLog({
      userId,
      userRole,
      action: 'AUDIT_LOG_VIEW',
      outcome: 'FAILURE',
      details: { reason: 'FORBIDDEN' },
      deviceSerial: session.user.deviceId, // 기기 계정이면 화면에 시리얼로 표시
    });
    return NextResponse.json({ message: '접근 권한이 없습니다.' }, { status: 403 });
  }

  const searchParams = Object.fromEntries(new URL(req.url).searchParams);
  if (!searchParams.startDate || !searchParams.endDate) {
    return NextResponse.json({ message: '날짜 범위가 필요합니다.' }, { status: 400 });
  }
  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      { message: '조회 조건이 올바르지 않습니다. (날짜 형식: YYYY-MM-DD)' },
      { status: 400 },
    );
  }
  const { startDate, endDate, page, pageSize } = parsed.data;
  const includeFcm = parsed.data.includeFcm === 'true';
  if (startDate > endDate) {
    return NextResponse.json({ message: '시작일이 종료일보다 늦습니다.' }, { status: 400 });
  }

  try {
    const startTimestamp = `${startDate} 00:00:00.000`;
    const endTimestamp = `${endDate} 23:59:59.999`;

    // 🔒 [uc_log_06] 페이지를 넘겨도 같은 목록이 되도록 첫 조회 시각(asOf) 뒤에 생긴 기록은 빼고 센다
    //   (조회마다 AUDIT_LOG_VIEW가 맨 앞에 붙어 OFFSET이 한 줄씩 밀리고 같은 행이 다음 페이지에 또 나오던 문제).
    //   기준 시각은 DB 시계로 정하고 마이크로초까지 문자열로 주고받는다(앱 서버 시계·JS Date 밀리초 절사와 무관하게)
    const asOf: string =
      parsed.data.asOf ??
      (await query('SELECT to_char(NOW(), $1) AS as_of', [AS_OF_FORMAT])).rows[0].as_of;
    const filterParams = [startTimestamp, endTimestamp, asOf, includeFcm];

    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM admin_audit_logs a WHERE ${LIST_FILTER_SQL}`,
      filterParams,
    );
    const total: number = countResult.rows[0]?.total ?? 0;

    // ⭐️ [핵심 수정] SQL 쿼리: 타입 불일치 오류 해결을 위해 명시적 TEXT 캐스팅 적용
    // 🔒 [uc_log_01] 역할·action 화이트리스트를 없애 기록된 모든 감사 이벤트를 표시
    //   (기존 목록에 없던 USER_ROLE_UPDATE·USER_DELETE·DEVICE_UPDATE·알림설정·SYSTEM 등이 화면에서 빠지던 문제)
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
WHERE ${LIST_FILTER_SQL}
ORDER BY a.created_at DESC, a.id DESC
LIMIT $5 OFFSET $6
`;

    const result = await query(sql, [...filterParams, pageSize, (page - 1) * pageSize]);

    const logs = result.rows.map((log) => {
      const details: Record<string, unknown> = {
        ...toDetailsObject(log.details, log.id),
        ...(log.target_user_name ? { targetUserName: log.target_user_name } : {}),
        ...(log.target_user_email ? { targetUserEmail: log.target_user_email } : {}),
        ...(log.user_email ? { userEmail: log.user_email } : {}),
      };

      return {
        ...log,
        details,
        // 최종 행위자 이름 결정
        user_name: log.audit_user_name || log.linked_user_name,
        // 🔒 [uc_log_01] 범주·결과 — 필드가 없는 이전 기록은 action·details.status로 판정
        category: typeof details.category === 'string' ? details.category : getAuditCategory(log.action),
        outcome:
          typeof details.outcome === 'string' ? details.outcome : inferAuditOutcome(log.action, details),
      };
    });

    // 🔒 [uc_log_01] 감사로그 열람 자체를 감사 기록 (조회 조건·건수만, 열람한 내용은 저장하지 않음)
    await createAuditLog({
      userId,
      userRole,
      action: 'AUDIT_LOG_VIEW',
      details: { startDate, endDate, page, pageSize, includeFcm, resultCount: logs.length, total },
    });

    return NextResponse.json({ logs, total, page, pageSize, asOf });
  } catch (error) {
    logServerError('Audit log query failed', error);
    await createAuditLog({
      userId,
      userRole,
      action: 'AUDIT_LOG_VIEW',
      outcome: 'FAILURE',
      details: { startDate, endDate, page, pageSize, includeFcm, reason: 'SERVER_ERROR' },
    });
    return NextResponse.json({ message: '활동 로그를 불러오는 데 실패했습니다.' }, { status: 500 });
  }
}
