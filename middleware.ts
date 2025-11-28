import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const path = req.nextUrl.pathname;
    const token = req.nextauth.token;
    
    // 토큰에서 역할(Role) 추출
    // (@ts-ignore: 커스텀 타입이라 에러 무시)
    // @ts-ignore
    const role = token?.role; 

    console.log(`🛡️ [Middleware] Path: ${path} | Role: ${role}`);

    // ------------------------------------------------------------
    // 1. 신규 가입자 (GUEST) 처리 -> Welcome 필수
    // ------------------------------------------------------------
    if (role === 'GUEST') {
      if (!path.startsWith('/welcome')) {
        console.log("🚀 [GUEST] Welcome 페이지로 이동시킴");
        return NextResponse.redirect(new URL('/welcome', req.url));
      }
      return NextResponse.next();
    }

    // ------------------------------------------------------------
    // 2. 승인 대기자 (PENDING) 처리 -> Pending 필수
    // ------------------------------------------------------------
    if (role === 'PENDING') {
      if (!path.startsWith('/pending')) {
        console.log("⏳ [PENDING] 승인 대기 페이지로 이동시킴");
        return NextResponse.redirect(new URL('/pending', req.url));
      }
      return NextResponse.next();
    }

    // ------------------------------------------------------------
    // 3. 정회원 (USER, ADMIN 등) 처리 -> 로그인/대기 페이지 접근 금지
    // ------------------------------------------------------------
    const approvedRoles = ['USER', 'ADMIN', 'MASTER', 'DEVICE_USER'];
    if (approvedRoles.includes(role as string)) {
      // 이미 가입된 사람이 welcome이나 pending, login 페이지에 가려고 하면 메인으로
      if (path.startsWith('/welcome') || path.startsWith('/pending') || path === '/login') {
        console.log("✅ [USER] 이미 가입된 회원입니다. 메인으로 이동.");
        return NextResponse.redirect(new URL('/', req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // true를 반환하면 미들웨어 로직 실행, false면 로그인 페이지로 리다이렉트
      authorized: ({ token }) => !!token, 
    },
    pages: {
      signIn: '/login', // 로그인이 안 된 상태면 여기로 보냄
    },
  }
);

export const config = {
  // api, static 파일, 이미지 등은 미들웨어 검사 제외
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|login|register).*)",
  ],
};