import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { rateLimiter } from '@/lib/rate-limiter';

// 🔒 [보안] Rate Limit이 적용될 경로 (브루트포스 방어)
const RATE_LIMIT_PATHS = [
  // NextAuth Credentials 로그인 시도 — provider id가 'device-login'이므로 실제 POST 경로는
  // /api/auth/callback/device-login (구 '/credentials' 경로는 매칭되지 않아 rate-limit 미발동이었음)
  '/api/auth/callback/device-login',
  '/api/auth/change-password',
  '/api/auth/profile-submit',
  '/api/auth/re-apply',
  '/api/ai-search', // 반복 호출로 외부 AI 비용이 소진되지 않게
  '/api/admin/users', // 회원 승인·역할 변경
];

// 🔒 [UC-03] 비로그인 허용 페이지(허용목록). 나머지 앱 페이지는 토큰이 없으면 '/'(기기 로그인 화면)로 보낸다
const PUBLIC_PAGES = ['/', '/login', '/privacy', '/account-deletion'];

// 정적 자산(public/ 폴더·Next 내부 경로) — 인증 없이 통과
const STATIC_PREFIXES = ['/_next', '/__next', '/images', '/sounds', '/icons', '/download'];
const STATIC_FILE_PATTERN = /\.[A-Za-z0-9]+$/; // favicon.ico, *.png, *.svg, *.webp, *.apk ...

// 앱에 실제로 있는 페이지(최상위 경로). 로그인·역할 차단은 이 페이지들에만 적용하고,
// 없는 경로는 그대로 통과시켜 Next가 404를 돌려주게 한다(KTC 6-1 '없는 경로 → 404' 응답 유지).
// ⚠️ 페이지를 새로 만들면 여기에 추가해야 로그인 보호가 적용된다.
const APP_PAGES = [
  '/admin-portal',
  '/ai-dashboard',
  '/audit-log',
  '/dashboard',
  '/device-admin',
  '/device-management',
  '/mobile-view',
  '/mypage',
  '/pending',
  '/register-check',
  '/stats',
  '/ulcer-alerts',
  '/user-management',
  '/welcome',
  '/wheelchair-info',
];

// 🔒 실제로 쓰는 역할 값만 인정(목록 밖 역할은 비로그인과 같게 취급 — fail-closed).
//    types/next-auth.d.ts AppRole·lib/authOptions.ts APP_ROLES와 같게 유지
const KNOWN_ROLES = ['GUEST', 'NEW_USER', 'PENDING', 'REJECTED', 'USER', 'ADMIN', 'MASTER', 'DEVICE_USER'];

// 역할별로 들어갈 수 있는 페이지(이 외의 앱 페이지는 역할별 첫 화면으로). ADMIN·MASTER·USER는 모바일 뷰만 제외
const ROLE_PAGES: Record<string, string[]> = {
  DEVICE_USER: ['/mobile-view', '/mypage'],
  GUEST: ['/welcome', '/pending'],
  NEW_USER: ['/welcome', '/pending'],
  PENDING: ['/pending'],
  REJECTED: ['/pending', '/welcome'], // 거절 사유 확인 후 정보 수정·재신청
};

// 역할별 첫 화면 ('/'·'/login'에 로그인 상태로 오거나 허용되지 않은 페이지에 접근할 때)
const ROLE_HOME: Record<string, string> = {
  DEVICE_USER: '/mobile-view',
  GUEST: '/welcome',
  NEW_USER: '/welcome',
  PENDING: '/pending',
  REJECTED: '/pending',
  ADMIN: '/dashboard',
  MASTER: '/dashboard',
  USER: '/dashboard',
};

// 🔒 [uc_auth_04] 초기 비밀번호 변경 전에 허용하는 화면·API
const FORCE_PASSWORD_PAGE = '/mypage';
const FORCE_PASSWORD_REDIRECT = '/mypage?force=1';
const FORCE_PASSWORD_API_PREFIX = '/api/auth/'; // 세션·로그아웃·change-password

// '/mypage'와 '/mypage/...'는 매칭, '/mypage2'는 매칭하지 않음
const matchesPath = (pathname: string, base: string): boolean =>
  pathname === base || pathname.startsWith(`${base}/`);

const isStaticAsset = (pathname: string): boolean =>
  STATIC_PREFIXES.some((p) => matchesPath(pathname, p)) || STATIC_FILE_PATTERN.test(pathname);

function getClientIp(req: NextRequest): string {
  // 🔒 Vercel/프록시가 실제 연결 IP로 설정하는 x-real-ip 우선.
  //    x-forwarded-for 첫 토큰은 클라이언트가 위조 가능해 rate-limit 우회에 악용될 수 있어 후순위로 둠.
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return '127.0.0.1';
}

function redirectTo(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, req.url));
}

// 세션 토큰 읽기 — 깨진 Authorization 헤더 등으로 getToken이 예외를 던져도 500 대신 비로그인으로 처리
async function readToken(req: NextRequest) {
  try {
    return await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  } catch {
    return null;
  }
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

  // API 인증은 각 API가 처리. 단, 초기 비밀번호 변경 전 계정은 /api/auth/* 외 API를 403으로 막는다
  if (pathname.startsWith('/api/')) {
    if (!pathname.startsWith(FORCE_PASSWORD_API_PREFIX)) {
      const apiToken = await readToken(req);
      if (apiToken?.mustChangePassword === true) {
        return new NextResponse(
          JSON.stringify({ message: '초기 비밀번호를 변경해야 서비스를 이용할 수 있습니다.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }
    return NextResponse.next();
  }

  // 정적 자산은 인증 없이 통과 (토큰 복호화 생략)
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // 1. 토큰(세션) 확인 — 목록 밖 역할의 토큰은 비로그인과 같게 취급
  const token = await readToken(req);
  const role = typeof token?.role === 'string' && KNOWN_ROLES.includes(token.role) ? token.role : null;
  const mustChangePassword = role !== null && token?.mustChangePassword === true;

  // 1-1. 로그인 화면('/', '/login'): 로그인 상태면 역할별 첫 화면으로 (비밀번호 변경 대상은 변경 화면으로)
  if (pathname === '/' || pathname === '/login') {
    if (!role) return NextResponse.next();
    if (mustChangePassword) return redirectTo(req, FORCE_PASSWORD_REDIRECT);
    return redirectTo(req, ROLE_HOME[role]);
  }

  // 1-2. 그 밖의 공개 페이지(개인정보 처리방침 등)는 누구나
  if (PUBLIC_PAGES.some((p) => matchesPath(pathname, p))) {
    return NextResponse.next();
  }

  // 1-3. 앱에 없는 경로는 Next가 404를 돌려주도록 통과
  if (!APP_PAGES.some((p) => matchesPath(pathname, p))) {
    return NextResponse.next();
  }

  // ============================================================
  // 이하: 앱 페이지
  // ============================================================

  // 2. 비로그인(또는 목록 밖 역할) -> 루트('/')로 튕겨냄
  if (!role) {
    return redirectTo(req, '/');
  }

  // 3. 초기 비밀번호 변경 전이면 마이페이지(변경 화면)만 허용
  if (mustChangePassword) {
    return matchesPath(pathname, FORCE_PASSWORD_PAGE)
      ? NextResponse.next()
      : redirectTo(req, FORCE_PASSWORD_REDIRECT);
  }

  // 4. 역할에 맞지 않는 페이지 접근 차단 (보안 & 길 안내)
  const allowedPages = ROLE_PAGES[role];
  if (allowedPages && !allowedPages.some((p) => matchesPath(pathname, p))) {
    return redirectTo(req, ROLE_HOME[role]);
  }

  // 🔒 관리자가 모바일 뷰에 접근하려 할 때 -> 대시보드로 (화면 혼선 방지)
  if ((role === 'ADMIN' || role === 'MASTER' || role === 'USER') && matchesPath(pathname, '/mobile-view')) {
    return redirectTo(req, '/dashboard');
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
