// 📍 경로: lib/login-banner.ts
// 🔒 [uc_auth_11] 로그인 화면 시스템 사용 알림 배너 — MASTER가 설정한 문구를 system_settings에서 읽는다.
//   서버 전용(DB 접근). 클라이언트 컴포넌트는 이 파일을 import하지 말고 prop·API 응답으로 받는다.

import { query } from '@/lib/db';
import { logServerError } from '@/lib/server-log';

export const LOGIN_BANNER_KEY = 'login_banner';
export const LOGIN_BANNER_MAX_LENGTH = 500;

// DB에 설정이 없거나 조회에 실패해도 배너는 항상 보여야 하므로 현행 문구를 기본값으로 둔다
export const DEFAULT_LOGIN_BANNER =
  '본 시스템은 인가된 사용자만 이용할 수 있습니다. 모든 접속 및 활동은 기록·모니터링되며, 무단 접근 시 관련 법령에 따라 책임을 물을 수 있습니다.';

// 저장 전 정규화: 줄바꿈만 남기고 제어문자 제거, 연속 빈 줄 축소, 앞뒤 공백 제거 (화면은 텍스트로만 렌더)
export function normalizeBannerText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 실패해도 예외 없이 기본 문구를 돌려준다 (로그인 화면 렌더를 막지 않기 위해)
export async function getLoginBanner(): Promise<string> {
  try {
    const result = await query('SELECT value FROM system_settings WHERE key = $1', [LOGIN_BANNER_KEY]);
    const value: unknown = result.rows[0]?.value;
    return typeof value === 'string' && value.trim() ? value : DEFAULT_LOGIN_BANNER;
  } catch (error) {
    logServerError('Login banner load failed', error);
    return DEFAULT_LOGIN_BANNER;
  }
}
