import { io } from 'socket.io-client';

// 🟢 [핵심 수정 1] 환경변수를 우선 사용하고, 없으면 HTTPS 주소(s 붙음)를 기본값으로 사용
// worker.ts가 https 모듈로 실행 중이므로 반드시 'https://'여야 합니다.
const URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://43.202.90.244:8080';

// 🟢 [핵심 수정 2] 소켓 옵션 추가
export const socket = io(URL, {
  autoConnect: false,
  transports: ['websocket'], // 폴링 방지하고 웹소켓 강제 (연결 안정성 UP)
  secure: true, // HTTPS 연결 명시
  rejectUnauthorized: false, // 🚨 중요: 자체 서명 인증서(pem 파일)일 경우 에러 무시 설정
});
