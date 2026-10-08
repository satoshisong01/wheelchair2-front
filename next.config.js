/** @type {import('next').NextConfig} */
const nextConfig = {
  // 🔒 응답 헤더 X-Powered-By(Next.js) 제거 — 서버 기술 노출 최소화 (EC2는 Nginx에서도 숨김)
  poweredByHeader: false,

  // 0. Vercel 서버리스 함수 번들에 RDS CA 파일 포함 (getDbSslOption이 런타임에 fs로 읽음)
  //    → CA가 없으면 lib/db.ts가 DB 연결을 차단하므로 DB를 쓰는 API 함수에는 반드시 포함되어야 함
  outputFileTracingIncludes: {
    '/api/**': ['./certs/rds-global-bundle.pem'],
    // 로그인 배너를 DB에서 읽는 '/'·'/login'(ISR)도 lib/db를 불러옴 — CA가 없으면 lib/db가 연결을 막으므로 함께 포함 (Vercel 함수 번들용)
    '/': ['./certs/rds-global-bundle.pem'],
    '/login': ['./certs/rds-global-bundle.pem'],
  },

  // 1. 보안 헤더 설정
  async headers() {
    // 🔒 [보안] Content-Security-Policy
    // - Next.js + Kakao 지도 + Socket.io(broker.firstcorea.com) + Vercel 환경에 맞게 구성
    // - inline 스크립트/스타일은 Next.js 내부에서 사용되므로 unsafe-inline 허용 (불가피)
    // - Socket.io는 polling+websocket으로 https/wss 모두 사용하므로 명시적으로 broker 도메인 포함
    // 🔒 운영에서는 평문 전송(http:/ws:) 제거, 개발에서는 HMR(ws://localhost) 위해 유지
    // - 카카오 지도 SDK(sdk.js)가 2026-10부터 본 스크립트·라이브러리를 t1.kakaocdn.net에서 불러옴 (기존 t1.daumcdn.net) → *.kakaocdn.net 허용
    const isProd = process.env.NODE_ENV === 'production';
    const connectSrc = isProd
      ? "connect-src 'self' https: wss: https://broker.firstcorea.com https://broker.firstcorea.com:8080 wss://broker.firstcorea.com wss://broker.firstcorea.com:8080"
      : "connect-src 'self' https: http: wss: ws: https://broker.firstcorea.com https://broker.firstcorea.com:8080 wss://broker.firstcorea.com wss://broker.firstcorea.com:8080";
    // 🔒 운영 이미지는 https만 허용 (개발 http://localhost는 기존 동작 유지)
    const imgSrc = isProd
      ? "img-src 'self' data: blob: https:"
      : "img-src 'self' data: blob: https: http:";
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dapi.kakao.com https://t1.daumcdn.net https://*.kakaocdn.net https://*.vercel-insights.com https://*.googleapis.com https://vercel.live https://*.vercel.live",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      imgSrc,
      "font-src 'self' data: https://fonts.gstatic.com",
      // 🔌 Socket.io / API / 외부 서비스 연결 허용
      connectSrc,
      // 🔒 앱은 iframe을 쓰지 않음(카카오 지도는 DOM 렌더링, 카카오 로그인은 전체 페이지 이동) → 자기 출처만
      "frame-src 'self'",
      "media-src 'self' blob: data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), microphone=(), camera=()' },
          { key: 'Content-Security-Policy', value: csp },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // 🔒 다른 출처 창과 window 참조를 분리 (앱은 팝업을 쓰지 않음)
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // 🔒 다른 사이트가 우리 리소스를 끌어다 쓰지 못하게 함
          //    (COEP require-corp는 CORP 없는 카카오 지도 리소스를 막아 지도가 멈추므로 제외)
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
