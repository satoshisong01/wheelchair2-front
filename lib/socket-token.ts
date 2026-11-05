// lib/socket-token.ts — 실시간 알람 소켓 접속용 서명 토큰 (서버 전용)
// 웹이 로그인 세션의 사용자 ID·역할을 SOCKET_TOKEN_SECRET 으로 HMAC-SHA256 서명해 발급하고,
// 소켓 서버(워커)가 같은 시크릿으로 서명·만료를 검사한 뒤 토큰 안의 값으로만 권한을 판단한다(클라이언트가 보낸 값은 믿지 않음).
// 형식: base64url(JSON {uid, role, exp}) + '.' + base64url(HMAC) — 워커 worker.ts 의 verifySocketToken 과 같게 유지할 것

import { createHmac } from 'crypto';

// 접속(재접속 포함) 때마다 새로 받으므로 짧게 둔다
export const SOCKET_TOKEN_TTL_SEC = 300;

export function signSocketToken(uid: string, role: string, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid, role, exp: Math.floor(Date.now() / 1000) + SOCKET_TOKEN_TTL_SEC }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
