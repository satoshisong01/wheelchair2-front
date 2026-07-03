/** @type {import('next').NextConfig} */
const nextConfig = {
  // 0. Vercel 서버리스 함수 번들에 RDS CA 파일 포함 (getDbSslOption이 런타임에 fs로 읽음)
  //    → 이게 잡히면 DATABASE_CA_CERT 붙여넣기 없이 파일만으로 검증 가능
  outputFileTracingIncludes: {
    '/api/**': ['./certs/rds-global-bundle.pem'],
  },

  // 1. 보안 헤더 설정
  async headers() {
    // 🔒 [보안] Content-Security-Policy
    // - Next.js + Kakao 지도 + Socket.io(broker.firstcorea.com) + Vercel 환경에 맞게 구성
    // - inline 스크립트/스타일은 Next.js 내부에서 사용되므로 unsafe-inline 허용 (불가피)
    // - Socket.io는 polling+websocket으로 https/wss 모두 사용하므로 명시적으로 broker 도메인 포함
    // 🔒 운영에서는 평문 전송(http:/ws:) 제거, 개발에서는 HMR(ws://localhost) 위해 유지
    const isProd = process.env.NODE_ENV === 'production';
    const connectSrc = isProd
      ? "connect-src 'self' https: wss: https://broker.firstcorea.com https://broker.firstcorea.com:8080 wss://broker.firstcorea.com wss://broker.firstcorea.com:8080"
      : "connect-src 'self' https: http: wss: ws: https://broker.firstcorea.com https://broker.firstcorea.com:8080 wss://broker.firstcorea.com wss://broker.firstcorea.com:8080";
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dapi.kakao.com https://t1.daumcdn.net https://*.vercel-insights.com https://*.googleapis.com https://vercel.live https://*.vercel.live",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https: http:",
      "font-src 'self' data: https://fonts.gstatic.com",
      // 🔌 Socket.io / API / 외부 서비스 연결 허용
      connectSrc,
      "frame-src 'self' https:",
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
        ],
      },
    ];
  },

  // 2. ‼️ [필수] TypeORM Webpack 빌드 오류 해결
  webpack: (config, { isServer }) => {
    if (isServer) {
      const optionalDrivers = [
        'react-native-sqlite-storage',
        'sqlite3',
        'mysql',
        'mysql2',
        'oracledb',
        'pg-native',
        'better-sqlite3',
        '@sap/hana-client/extension/Stream', // ‼️ 정확한 경로 추가
        '@sap/hana-client',
      ];

      config.externals = [...(config.externals || []), ...optionalDrivers];
    }

    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      /the request of a dependency is an expression/,
    ];

    return config;
  },
};

module.exports = nextConfig;