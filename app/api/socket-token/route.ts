// app/api/socket-token/route.ts — 실시간 알람 소켓 접속 토큰 발급 (로그인 세션 필수)
// 🔒 소켓 서버는 이 토큰의 서명이 맞아야 알람 방(관리자 전체·본인 휠체어)에 넣어 준다

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { signSocketToken } from '@/lib/socket-token';

// 알람을 받는 역할만 발급 (승인 대기·거절 계정은 소켓 알람 대상 아님)
const SOCKET_ROLES = ['ADMIN', 'MASTER', 'DEVICE_USER'];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }
  if (!SOCKET_ROLES.includes(session.user.role)) {
    return NextResponse.json({ message: '접근 권한이 없습니다.' }, { status: 403 });
  }

  const secret = process.env.SOCKET_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    console.error('[socket-token] SOCKET_TOKEN_SECRET 이 없거나 32자 미만입니다.');
    return NextResponse.json({ message: '서버 설정 오류' }, { status: 500 });
  }

  return NextResponse.json(
    { token: signSocketToken(session.user.id, session.user.role, secret) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
