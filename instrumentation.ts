// instrumentation.ts — Next.js 서버 시작 시 1회 실행되는 가드
// 🔒 [보안] NODE_TLS_REJECT_UNAUTHORIZED=0 (전역 TLS 인증서 검증 비활성화)을 감지하면
//   기동 자체를 차단한다. (보안업체 SAST 권고: 시작 엔트리포인트 강제 검사)
// 🔒 [보안] 환경변수 누락도 기동 단계에서 드러낸다 (값은 출력하지 않고 이름만)
//   - 없으면 DB·로그인 세션이 성립하지 않는 값 → 기동 차단
//   - 없으면 카카오 로그인·요청 제한·로그인 잠금만 꺼지는 값 → 경고 (Redis 장애 정책 결정 전까지 차단 안 함)
//   - DB 인증서(CA) 확인은 lib/db.ts가 DB 모듈 로드 시 수행 (없으면 연결 차단)
const REQUIRED_ENV = ['DATABASE_URL', 'NEXTAUTH_SECRET'];
const WARN_IF_MISSING_ENV = [
  'KAKAO_CLIENT_ID',
  'KAKAO_CLIENT_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

function checkEnv(): void {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `[SECURITY] 필수 환경변수 누락: ${missing.join(', ')} — 설정한 뒤 다시 시작하세요.`,
    );
  }

  const missingOptional = WARN_IF_MISSING_ENV.filter((name) => !process.env[name]);
  if (missingOptional.length > 0) {
    console.warn(
      `[SECURITY] 환경변수 누락: ${missingOptional.join(', ')} — 카카오 로그인 또는 요청 제한·로그인 잠금이 동작하지 않습니다.`,
    );
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  if (redisUrl && !redisUrl.startsWith('https://')) {
    console.warn(
      '[SECURITY] UPSTASH_REDIS_REST_URL이 https:// 주소가 아닙니다 — 요청 제한·로그인 잠금 통신이 암호화되지 않습니다.',
    );
  }
}

export async function register() {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new Error(
      '[SECURITY] NODE_TLS_REJECT_UNAUTHORIZED=0 감지 — TLS 인증서 검증 비활성화는 금지되어 있습니다. 환경변수를 제거한 뒤 다시 시작하세요.',
    );
  }
  // register는 Edge 런타임(middleware)에서도 불리므로 Node 서버 기동 때만 점검
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    checkEnv();
  }
}
