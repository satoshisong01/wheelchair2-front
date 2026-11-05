// 실시간 알람 소켓 서버 주소 — 환경변수에서만 읽는다(하드코딩 기본값 없음).
// https/wss 형식인지는 next.config.js 가 빌드 때 검사해, 평문(http/ws) 주소로는 빌드되지 않는다.
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL as string;
