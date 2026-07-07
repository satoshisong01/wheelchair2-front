// instrumentation.ts — Next.js 서버 시작 시 1회 실행되는 가드
// 🔒 [보안] NODE_TLS_REJECT_UNAUTHORIZED=0 (전역 TLS 인증서 검증 비활성화)을 감지하면
//   기동 자체를 차단한다. (보안업체 SAST 권고: 시작 엔트리포인트 강제 검사)
export async function register() {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new Error(
      '[SECURITY] NODE_TLS_REJECT_UNAUTHORIZED=0 감지 — TLS 인증서 검증 비활성화는 금지되어 있습니다. 환경변수를 제거한 뒤 다시 시작하세요.',
    );
  }
}
