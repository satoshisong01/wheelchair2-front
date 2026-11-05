// lib/socket-auth.ts — socket.io 클라이언트의 auth 옵션: 접속(재접속 포함) 때마다 서명 토큰을 새로 받아 핸드셰이크에 실어 보낸다
// 토큰을 못 받으면 빈 값으로 접속 → 소켓 서버가 구독(알람 방 입장)을 거부하고 연결을 끊는다

export const socketAuth = (cb: (data: { token?: string }) => void): void => {
  fetch('/api/socket-token', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : {}))
    .then((data: { token?: string }) => cb({ token: data.token }))
    .catch(() => cb({}));
};
