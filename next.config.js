/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. 보안 헤더 설정
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
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