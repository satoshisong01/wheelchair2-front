import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { rateLimiter } from '@/lib/rate-limiter';

// 🔒 [보안] Rate Limit이 적용될 경로 (브루트포스 방어)
const RATE_LIMIT_PATHS = [
  '/api/auth/callback/credentials', // NextAuth 로그인 시도
  '/api/auth/change-password',
  '/api/auth/profile-submit',
  '/api/auth/re-apply',
];

function getClientIp(req: NextRequest): string {
  // 🔒 Vercel/프록시가 실제 연결 IP로 설정하는 x-real-ip 우선.
  //    x-forwarded-for 첫 토큰은 클라이언트가 위조 가능해 rate-limit 우회에 악용될 수 있어 후순위로 둠.
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return '127.0.0.1';
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 🔒 [CSRF] 상태 변경 API(POST/PUT/PATCH/DELETE)의 Origin 검증 — 교차 출처(다른 사이트)발 위조 요청 차단.
  //   세션 쿠키 SameSite=Lax에 더한 방어 심화. Origin이 없으면(네이티브 앱/서버간 호출) 통과시켜 정상 동작 보존.
  if (
    pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
  ) {
    const origin = req.headers.get('origin');
    if (origin) {
      const host = req.headers.get('host');
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = 'invalid';
      }
      if (!host || originHost !== host) {
        return new NextResponse(
          JSON.stringify({ message: '요청 출처가 유효하지 않습니다.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }
  }

  // 🔒 [보안] Rate Limit 적용 (Upstash Redis 기반)
  if (RATE_LIMIT_PATHS.some((p) => pathname.startsWith(p))) {
    try {
      const ip = getClientIp(req);
      const { success, limit, remaining, reset } = await rateLimiter.limit(`rl:${ip}:${pathname}`);
      if (!success) {
        return new NextResponse(
          JSON.stringify({ message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': String(remaining),
              'X-RateLimit-Reset': String(reset),
            },
          },
        );
      }
    } catch (e) {
      // Upstash 장애 시에도 서비스 자체는 동작해야 하므로 통과
      console.warn('[RateLimit] Upstash 오류, 통과 처리:', (e as Error).message);
    }
  }

  // API 경로는 페이지 리다이렉트 로직을 적용하지 않음 (각 API에서 자체 인증 처리)
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // 1. 토큰(세션) 확인
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // 🔒 [보안] 개발 환경에서만 디버깅 로그 출력 (운영 환경에서 사용자 역할 노출 방지)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🛡️ [Middleware] Path: ${pathname} | UserRole: ${token?.role || 'None'}`);
  }

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
  // Rate Limit 적용 대상 API는 미들웨어를 통과해야 하므로 매처에 포함
  // (_next/static, _next/image, favicon.ico만 제외)
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
