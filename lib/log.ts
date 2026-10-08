// 📍 경로: lib/log.ts (최종 수정 전체 코드)

import { query } from '@/lib/db';
import { deidentifyDetails } from '@/lib/deidentify'; // 🔒 [DC-02] 로그 내 개인식별자 비식별화
import { summarizeError } from '@/lib/server-log';

// 🔒 [uc_log_01] 감사 이벤트 범주 — 업체 요구 6개 범주 + 시스템 이벤트(서버 경보 등)
export type AuditCategory =
  | 'ACCESS_CONTROL' // 접근통제: 로그인·로그아웃·계정 승인/거절·역할 변경·권한 거부
  | 'REQUEST_ERROR' // 요청 오류
  | 'DEVICE' // 의료기기(휠체어) 등록·수정·삭제·알람 처리
  | 'BACKUP_RECOVERY' // 백업·복구
  | 'CONFIG_CHANGE' // 설정 변경(알림 설정·로그인 배너 등)
  | 'AUDIT_ACCESS' // 감사로그 열람
  | 'SYSTEM' // 서버 경보 등 시스템 이벤트
  | 'OTHER';

export type AuditOutcome = 'SUCCESS' | 'FAILURE';

// 호출부가 category를 넘기지 않으면 action으로 범주를 정한다 (기존 호출 하위호환)
const ACTION_CATEGORIES = new Map<string, AuditCategory>([
  ['LOGIN', 'ACCESS_CONTROL'],
  ['LOGOUT', 'ACCESS_CONTROL'],
  ['LOGIN_FAILED', 'ACCESS_CONTROL'],
  ['ACCOUNT_LOCKED', 'ACCESS_CONTROL'],
  ['ACCESS_DENIED', 'ACCESS_CONTROL'],
  ['USER_APPROVE', 'ACCESS_CONTROL'],
  ['USER_REJECT', 'ACCESS_CONTROL'],
  ['USER_ROLE_UPDATE', 'ACCESS_CONTROL'],
  ['USER_DELETE', 'ACCESS_CONTROL'],
  ['USER_ROLE_UPDATE_FAILED', 'ACCESS_CONTROL'],
  ['USER_SIGNUP', 'ACCESS_CONTROL'],
  ['USER_REAPPLY', 'ACCESS_CONTROL'],
  ['USER_UPDATE', 'ACCESS_CONTROL'], // 비밀번호 변경
  ['DEVICE_REGISTER', 'DEVICE'],
  ['DEVICE_REGISTER_FAILED', 'DEVICE'],
  ['DEVICE_UPDATE', 'DEVICE'],
  ['DEVICE_DELETE', 'DEVICE'],
  ['DEVICE_DELETE_FAILED', 'DEVICE'],
  ['ALARM_RESOLVE', 'DEVICE'],
  ['MAINTENANCE_CREATE', 'DEVICE'],
  ['DEVICE_NOTIFICATION_TOGGLE', 'CONFIG_CHANGE'],
  ['DEVICE_NOTIFICATION_INIT', 'CONFIG_CHANGE'],
  ['USER_SETTINGS_UPDATE', 'CONFIG_CHANGE'],
  ['BANNER_UPDATE', 'CONFIG_CHANGE'],
  ['SYSTEM_CONFIG_CHANGE', 'CONFIG_CHANGE'],
  ['AUDIT_LOG_VIEW', 'AUDIT_ACCESS'],
  ['SERVER_ALERT', 'SYSTEM'],
  ['INTEGRITY_CHECK', 'SYSTEM'],
  ['SECURITY_FUNCTION_TEST', 'SYSTEM'],
]);

export function getAuditCategory(action: string): AuditCategory {
  return ACTION_CATEGORIES.get(action) ?? 'OTHER';
}

// 기존 호출은 details.status('Success'/'Failed')로 결과를 남겨 왔으므로 그 값(또는 실패형 action)으로 결과를 판정
const FAILURE_PATTERN = /fail|error|denied|forbidden|locked/i;

export function inferAuditOutcome(
  action: string,
  details?: Record<string, unknown> | null,
): AuditOutcome {
  const status = details?.status;
  const statusText = typeof status === 'string' ? status : '';
  return FAILURE_PATTERN.test(statusText) || FAILURE_PATTERN.test(action) ? 'FAILURE' : 'SUCCESS';
}

// 🔒 [uc_log] 감사 레코드 크기·형식 제한 — 거부(throw)하면 감사가 유실되므로 잘라서 저장
const MAX_FIELD_LENGTH = 255; // user_id·user_role·action·device_serial·user_name
const MAX_DETAIL_STRING_LENGTH = 1000; // details 안 문자열 값 하나
const MAX_DETAILS_BYTES = 8 * 1024; // details 직렬화 전체
const MAX_DETAILS_DEPTH = 5;
const DETAILS_PREVIEW_LENGTH = 2000;
// 필드 값: 줄바꿈 포함 모든 제어문자 제거 — 로그 위조(가짜 줄 끼워넣기) 방지
const CONTROL_CHARS = /[\u0000-\u001f\u007f]+/g;
// details 문자열: JSON 직렬화로 줄바꿈·탭이 이스케이프되어 위조가 불가하므로 둘은 남기고(프로세스 스냅샷 등 원문 보존)
// 나머지 제어문자만 제거 (NUL은 jsonb 저장 오류, ESC는 터미널 제어 시퀀스 위험)
const DETAIL_CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f]+/g;

// 자르다 생긴 짝 없는 서로게이트(이모지 절반 등)는 jsonb가 거부해 감사가 유실되므로 toWellFormed로 정리
const cleanText = (value: string, max: number): string =>
  value.replace(CONTROL_CHARS, ' ').slice(0, max).toWellFormed();

function cleanField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return cleanText(String(value), MAX_FIELD_LENGTH).trim() || null;
}

function cleanDetailValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') {
    const text = value
      .replace(DETAIL_CONTROL_CHARS, ' ')
      .slice(0, MAX_DETAIL_STRING_LENGTH)
      .toWellFormed();
    return value.length > MAX_DETAIL_STRING_LENGTH ? `${text}…(truncated)` : text;
  }
  if (typeof value === 'bigint') return value.toString(); // JSON.stringify가 BigInt에서 예외를 내지 않도록
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DETAILS_DEPTH) return '[depth-limit]';
  if (Array.isArray(value)) return value.map((item) => cleanDetailValue(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      cleanText(key, MAX_FIELD_LENGTH),
      cleanDetailValue(item, depth + 1),
    ]),
  );
}

function serializeDetails(details: Record<string, unknown>): string {
  const json = JSON.stringify(details);
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes <= MAX_DETAILS_BYTES) return json;
  // 상한 초과 → 범주·결과는 남기고 나머지는 앞부분만 보존(_truncated 표시)
  return JSON.stringify({
    category: details.category,
    outcome: details.outcome,
    _truncated: true,
    _originalBytes: bytes,
    preview: json.slice(0, DETAILS_PREVIEW_LENGTH).toWellFormed(),
  });
}

// 개발 로그에서도 ID 전체는 남기지 않음
const maskId = (id: string): string => (id.length > 4 ? `${id.slice(0, 4)}****` : '****');

interface LogData {
  userId: string;
  userRole: string;
  action: 'LOGIN' | 'LOGOUT' | 'DEVICE_REGISTER' | 'DEVICE_DELETE' | 'USER_UPDATE' | string;
  details: Record<string, unknown>;
  deviceSerial?: string;
  userName?: string; // ⭐️ [추가] user_name 필드 추가
  category?: AuditCategory; // 생략 시 action으로 결정
  outcome?: AuditOutcome; // 생략 시 details.status·action으로 결정
}

export const createAuditLog = async ({
  userId,
  userRole,
  action,
  details,
  deviceSerial,
  userName, // ⭐️ [추가] userName 매개변수 받기
  category,
  outcome,
}: LogData) => {
  let safeRole = 'UNKNOWN';
  let safeAction = 'UNKNOWN';
  let params: unknown[];
  try {
    // 🔒 [uc_log_01] 역할과 무관하게 모든 이벤트를 기록 (기존엔 4개 역할 외는 조용히 버려 감사 누락).
    //   행위자 정보가 비면 UNKNOWN으로 남기고 경고 — 예외를 던지면 호출 기능이 깨지므로 기록 후 경고만.
    safeRole = cleanField(userRole) ?? 'UNKNOWN';
    safeAction = cleanField(action) ?? 'UNKNOWN';
    const safeUserId = cleanField(userId) ?? 'UNKNOWN';
    if (safeRole === 'UNKNOWN' || safeUserId === 'UNKNOWN') {
      console.warn('⚠️ [AUDIT] 행위자 정보가 없는 감사 이벤트 — UNKNOWN으로 기록', { action: safeAction });
    }

    // 🔒 [DC-02] details 내 개인식별자(이름/전화/이메일/응급연락처)를 비식별화한 뒤 제어문자·크기 제한
    const safeDetails = cleanDetailValue(deidentifyDetails(details || {}), 0) as Record<string, unknown>;
    // 🔒 [uc_log_01] 범주·결과를 details에 함께 저장 (컬럼 추가 없이 기존 행과 호환)
    const finalDetails = {
      ...safeDetails,
      category: category ?? getAuditCategory(safeAction),
      outcome: outcome ?? inferAuditOutcome(safeAction, safeDetails),
    };

    params = [
      safeUserId,
      safeRole,
      safeAction,
      serializeDetails(finalDetails),
      cleanField(deviceSerial),
      cleanField(userName),
    ];
  } catch (error) {
    // 입력 정리 단계 오류도 본 작업을 막지 않고 고경보 마커로 남김
    const summary = summarizeError(error);
    console.error('🚨 [AUDIT-FAILURE] 감사 로그 기록 실패 — 즉시 확인 필요', {
      action: safeAction,
      userRole: safeRole,
      code: summary.code ?? 'N/A',
      message: summary.message,
    });
    return;
  }

  // Raw SQL: admin_audit_logs 테이블에 로그 INSERT
  const sql = `
            INSERT INTO admin_audit_logs (user_id, user_role, action, details, device_serial, user_name, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW());
        `;

  // 🔒 [UC-05] 감사 처리 실패 대응: 1회 재시도 후, 끝내 실패 시 고경보 마커 로그(모니터링 감지용).
  // 감사 기록 실패가 본 작업(로그인/기기관리 등)을 중단시키지 않도록 예외를 전파하지 않는다.
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await query(sql, params);
      // 🔒 [보안] 개발 환경에서만 식별자(마스킹)를 출력 — 운영 판별 오타로 노출되지 않게 development 일치 비교
      if (process.env.NODE_ENV === 'development') {
        console.log(
          `✅ [Audit Log Success] ${safeRole} ${safeAction} recorded (User: ${maskId(String(params[0]))}, Device: ${params[4]})`,
        );
      } else {
        console.log(`✅ [Audit Log Success] ${safeRole} ${safeAction} recorded`);
      }
      return;
    } catch (error) {
      lastErr = error;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 200)); // 짧은 백오프 후 재시도
    }
  }

  // 재시도까지 실패 → 감사 처리 실패 대응(별도 마커로 출력하여 server-monitor/CloudWatch가 알림)
  // 오류 원문(스택·SQL 상세값) 대신 이름·코드·짧은 메시지만 남김
  const summary = summarizeError(lastErr);
  console.error('🚨 [AUDIT-FAILURE] 감사 로그 기록 실패 — 즉시 확인 필요', {
    action: safeAction,
    userRole: safeRole,
    code: summary.code ?? 'N/A',
    message: summary.message,
  });
};
