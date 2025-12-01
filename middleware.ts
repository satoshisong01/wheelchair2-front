import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  // 1. 토큰(세션) 확인
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  console.log(
    `🛡️ [Middleware] Path: ${pathname} | UserRole: ${token?.role || 'None'}`
  );

  // ============================================================
  // CASE 1: 로그인이 되어 있는 상태 (Token O)
  // ============================================================
  if (token) {
    const role = token.role as string;

    // 1-1. 이미 로그인했는데, 또 로그인 페이지('/')나 '/login'에 왔을 때 -> 제자리로 보냄
    if (pathname === '/' || pathname === '/login') {
      // (1) 기기 사용자 -> 기기 전용 뷰로
      if (role === 'DEVICE_USER') {
        return NextResponse.redirect(new URL('/wheelchair-info', req.url));
      }

      // (2) 신규 가입자 (DB에는 있는데 아직 정보입력 안 함) -> Welcome 페이지로
      if (role === 'GUEST' || role === 'NEW_USER') {
        return NextResponse.redirect(new URL('/welcome', req.url));
      }

      // (3) 승인 대기중 (정보입력 완료, 승인 대기) -> 대기 페이지로
      if (role === 'PENDING') {
        return NextResponse.redirect(new URL('/pending', req.url));
      }

      // (4) 승인 거절됨 -> 거절 안내 페이지 (선택사항)
      if (role === 'REJECTED') {
        // 거절 페이지가 없다면 pending이나 로그아웃 유도
        return NextResponse.redirect(new URL('/pending', req.url));
      }

      // (5) 관리자/마스터/일반유저 (승인됨) -> 대시보드로
      if (role === 'ADMIN' || role === 'MASTER' || role === 'USER') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }

    // 1-2. 역할에 맞지 않는 페이지 접근 차단 (보안)

    // GUEST가 다른 곳 가려고 할 때
    if (
      (role === 'GUEST' || role === 'NEW_USER') &&
      !pathname.startsWith('/welcome')
    ) {
      return NextResponse.redirect(new URL('/welcome', req.url));
    }

    // PENDING이 다른 곳 가려고 할 때
    if (role === 'PENDING' && !pathname.startsWith('/pending')) {
      return NextResponse.redirect(new URL('/pending', req.url));
    }
  }

  // ============================================================
  // CASE 2: 로그인이 안 된 상태 (Token X)
  // ============================================================
  else {
    // 로그인이 필요한 페이지들 목록
    const protectedPaths = [
      '/dashboard',
      '/admin',
      '/welcome',
      '/pending',
      '/statistics',
      '/wheelchair-info',
    ];

    // 보호된 페이지에 접근하려고 하면 -> 루트('/')로 튕겨냄 (A페이지로 이동)
    const isProtected = protectedPaths.some((path) =>
      pathname.startsWith(path)
    );
    if (isProtected) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  // 아무 문제 없으면 통과
  return NextResponse.next();
}

export const config = {
  // 아래 경로들은 미들웨어를 거치지 않음 (API, 이미지, 정적 파일 등)
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
