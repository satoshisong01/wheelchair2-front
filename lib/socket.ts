// lib/socket.ts (신규 생성)

import { io } from 'socket.io-client';

// 1. EC2 서버의 주소 (k6 테스트 때 쓴 주소)
const URL = 'http://43.202.90.244:8080';

// 2. 소켓 인스턴스 생성
// autoConnect: false로 설정하여, 수동으로 연결을 시작하도록 합니다.
export const socket = io(URL, {
  autoConnect: false,
});
