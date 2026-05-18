/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. 보안 헤더 설정
  async headers() {
    // 🔒 [보안] Content-Security-Policy
    // - Next.js + Kakao 지도 + Vercel 환경에 맞게 구성
    // - inline 스크립트/스타일은 Next.js 내부에서 사용되므로 unsafe-inline 허용 (불가피)
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dapi.kakao.com https://t1.daumcdn.net https://*.vercel-insights.com https://*.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https: http:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https:",
      "media-src 'self' blob: data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests",
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