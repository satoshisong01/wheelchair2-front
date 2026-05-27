import { io } from 'socket.io-client';

// 환경변수를 우선 사용. worker.ts가 8080에서 직접 HTTPS(WSS) 운영하므로 반드시 https://
const URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || 'https://broker.firstcorea.com:8080';

// 🟢 [핵심 수정 2] 소켓 옵션 추가
export const socket = io(URL, {
  autoConnect: false,
  transports: ['websocket'], // 폴링 방지하고 웹소켓 강제 (연결 안정성 UP)
  secure: true, // HTTPS 연결 명시
  rejectUnauthorized: false, // 🚨 중요: 자체 서명 인증서(pem 파일)일 경우 에러 무시 설정
});
