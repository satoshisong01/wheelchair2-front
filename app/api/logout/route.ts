import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  // 1. NextAuth 관련 쿠키 강제 삭제
  // (프로덕션/개발 환경에 따라 쿠키 이름이 다를 수 있어 둘 다 삭제 시도)
  const cookieStore = await cookies();

  // 일반 쿠키 삭제
  cookieStore.delete('next-auth.session-token');
  cookieStore.delete('next-auth.csrf-token');
  cookieStore.delete('next-auth.callback-url');

  // 보안 쿠키(HTTPS) 삭제 (Vercel 배포 시 주로 이거임)
  cookieStore.delete('__Secure-next-auth.session-token');
  cookieStore.delete('__Secure-next-auth.callback-url');
  cookieStore.delete('__Host-next-auth.csrf-token');

  // 2. 로그아웃 성공 응답
  return NextResponse.json({ message: 'Logged out successfully' });
}
