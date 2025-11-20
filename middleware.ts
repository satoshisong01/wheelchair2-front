import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { rateLimiter } from '@/lib/rate-limiter';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --------------------------------------------------------------------
  // 1️⃣ [API 보안] Rate Limiter (API 요청 제한)
  // --------------------------------------------------------------------
  if (pathname.startsWith('/api/')) {
    // Auth 관련 API는 제한에서 제외 (로그인/로그아웃 등)
    if (pathname.startsWith('/api/auth/')) {
      return NextResponse.next();
    }

    const ip = (request.headers.get('x-forwarded-for') ?? '127.0.0.1')
      .split(',')[0]
      .trim();

    try {
      const { success, limit, remaining, reset } = await rateLimiter.limit(ip);

      if (!success) {
        console.warn(`RATE LIMIT: IP ${ip}가 API 요청을 초과했습니다.`);
        return new NextResponse(
          JSON.stringify({
            error: 'Too Many Requests',
            message: `요청 횟수가 초과되었습니다. ${new Date(
              reset
            ).toLocaleTimeString()} 이후에 다시 시도해주세요.`,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
            },
          }
        );
      }

      const response = NextResponse.next();
      response.headers.set('X-RateLimit-Limit', limit.toString());
      response.headers.set('X-RateLimit-Remaining', remaining.toString());
      // API 요청인 경우 여기서 처리를 끝내고 통과시킴 (API는 페이지 리다이렉트 불필요)
      return response;
    } catch (error) {
      console.error('Rate Limiter 에러:', error);
      // Redis 에러가 나더라도 서비스는 돌아가야 하므로 통과
      return NextResponse.next();
    }
  }

  // --------------------------------------------------------------------
  // 2️⃣ [페이지 권한] 정적 파일 통과 (이미지, CSS 등)
  // --------------------------------------------------------------------
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/icons') // 아이콘 폴더
  ) {
    return NextResponse.next();
  }

  // --------------------------------------------------------------------
  // 3️⃣ [토큰 검사] 사용자 인증 상태 확인
  // --------------------------------------------------------------------
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // 보호해야 할 페이지 목록 (로그인 필수)
  const protectedPaths = [
    '/dashboard',
    '/admin',
    '/pending',
    '/welcome',
    '/user-management',
    '/device-management',
    '/audit-log',
    '/wheelchair-info',
    '/stats',
  ];

  const isProtectedPath = protectedPaths.some((path) =>
    pathname.startsWith(path)
  );
  const isLoginPage = pathname === '/admin-portal';

  // --- Case A: 비로그인 사용자 ---
  if (!token) {
    // 보호된 페이지에 들어가려 하면 -> 관리자 로그인 포털로 튕겨냄
    if (isProtectedPath) {
      return NextResponse.redirect(new URL('/admin-portal', request.url));
    }
    // 그 외(기기 로그인 페이지인 '/' 등)는 통과
    return NextResponse.next();
  }

  // --- Case B: 로그인한 사용자 (Role 기반 교통정리) ---
  const role = token.role as string; // 'MASTER' | 'ADMIN' | 'PENDING' | 'REJECTED' | 'DEVICE_USER'

  // B-1: 승인 대기(PENDING) 또는 거절(REJECTED) 상태
  // -> 이들은 오직 /pending (상태확인)과 /welcome (재신청)만 갈 수 있음
  if (role === 'PENDING' || role === 'REJECTED') {
    if (pathname !== '/pending' && pathname !== '/welcome') {
      // 대시보드 등을 훔쳐보려 하면 강제로 대기실로 이동
      return NextResponse.redirect(new URL('/pending', request.url));
    }
    return NextResponse.next();
  }

  // B-2: 승인된 관리자 (MASTER / ADMIN)
  // -> 이들은 로그인 페이지나 대기 페이지를 볼 필요가 없음 -> 대시보드로 이동
  if (role === 'MASTER' || role === 'ADMIN') {
    if (isLoginPage || pathname === '/pending' || pathname === '/welcome') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    // 그 외 (/dashboard, /user-management 등)는 통과
    return NextResponse.next();
  }

  // B-3: 기기 사용자 (DEVICE_USER)
  // (별도 제약 없음, 페이지 레벨에서 보여줄 내용만 보여주면 됨)

  // 모든 검사 통과
  return NextResponse.next();
}

// 미들웨어가 실행될 경로 설정 (모든 경로 감시)
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
