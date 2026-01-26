import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  // 1. 토큰(세션) 확인
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  // 디버깅용 로그
  console.log(`🛡️ [Middleware] Path: ${pathname} | UserRole: ${token?.role || 'None'}`);

  // ============================================================
  // CASE 1: 로그인이 되어 있는 상태 (Token O)
  // ============================================================
  if (token) {
    const role = token.role as string;

    // 1-1. 이미 로그인했는데, 또 로그인 페이지('/')나 '/login'에 왔을 때 -> 제자리로 보냄
    if (pathname === '/' || pathname === '/login') {
      // 📱 (1) 기기 사용자 -> [신규] 모바일 앱 전용 화면으로 이동
      if (role === 'DEVICE_USER') {
        return NextResponse.redirect(new URL('/mobile-view', req.url));
      }

      // (2) 신규 가입자 -> Welcome 페이지
      if (role === 'GUEST' || role === 'NEW_USER') {
        return NextResponse.redirect(new URL('/welcome', req.url));
      }

      // (3) 승인 대기중 -> 대기 페이지
      if (role === 'PENDING') {
        return NextResponse.redirect(new URL('/pending', req.url));
      }

      // (4) 승인 거절됨 -> 대기 페이지
      if (role === 'REJECTED') {
        return NextResponse.redirect(new URL('/pending', req.url));
      }

      // 🖥️ (5) 관리자/마스터/일반유저 -> [기존 유지] 관리자 대시보드로 이동
      if (role === 'ADMIN' || role === 'MASTER' || role === 'USER') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }

    // 1-2. 역할에 맞지 않는 페이지 접근 차단 (보안 & 길 안내)

    // 🔒 기기 사용자가 관리자 화면에 접근하려 할 때 -> 모바일 뷰로 납치
    if (role === 'DEVICE_USER') {
      // 관리자용 페이지 목록
      const adminPaths = ['/dashboard', '/wheelchair-info', '/admin', '/statistics'];

      if (adminPaths.some((path) => pathname.startsWith(path))) {
        return NextResponse.redirect(new URL('/mobile-view', req.url));
      }
    }

    // 🔒 관리자가 모바일 뷰에 접근하려 할 때 -> 대시보드로 납치 (화면 혼선 방지)
    if (
      (role === 'ADMIN' || role === 'MASTER' || role === 'USER') &&
      pathname.startsWith('/mobile-view')
    ) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    // GUEST, PENDING 처리 (기존 유지)
    if (
      (role === 'GUEST' || role === 'NEW_USER') &&
      !pathname.startsWith('/welcome') &&
      !pathname.startsWith('/pending')
    ) {
      return NextResponse.redirect(new URL('/welcome', req.url));
    }
    if (role === 'PENDING' && !pathname.startsWith('/pending')) {
      return NextResponse.redirect(new URL('/pending', req.url));
    }
  }

  // ============================================================
  // CASE 2: 로그인이 안 된 상태 (Token X)
  // ============================================================
  else {
    // 로그인이 필요한 페이지들 목록 (mobile-view 추가됨)
    const protectedPaths = [
      '/mobile-view', // 👈 신규 추가
      '/dashboard',
      '/admin',
      '/welcome',
      '/pending',
      '/statistics',
      '/wheelchair-info',
    ];

    // 보호된 페이지에 접근하려고 하면 -> 루트('/')로 튕겨냄
    const isProtected = protectedPaths.some((path) => pathname.startsWith(path));
    if (isProtected) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  // 아무 문제 없으면 통과
  return NextResponse.next();
}

export const config = {
  // 아래 경로들은 미들웨어를 거치지 않음
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
