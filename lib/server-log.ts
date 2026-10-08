// lib/server-log.ts — 서버 오류 로그를 안전하게 남기는 공용 헬퍼
// 운영에서는 오류 원문(스택·SQL·DB 상세값)을 남기지 않고 이름·코드·짧은 메시지만 기록한다.
// (보안 점검 지적: console.error(…, error)로 오류 객체 원문이 서버 로그에 그대로 남음)
// 개발 환경이나 SERVER_LOG_VERBOSE=true일 때만 스택까지 남겨 디버깅을 돕는다.

const MAX_MESSAGE_LENGTH = 200;

interface SafeErrorSummary {
  name: string;
  code?: string;
  message: string;
}

// 제어문자(줄바꿈 포함)를 공백으로 바꿔 로그 위조(가짜 줄 끼워넣기)를 막고 길이를 제한
function sanitize(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, MAX_MESSAGE_LENGTH);
}

export function summarizeError(error: unknown): SafeErrorSummary {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      name: sanitize(error.name),
      ...(typeof code === 'string' || typeof code === 'number' ? { code: sanitize(String(code)) } : {}),
      message: sanitize(error.message),
    };
  }
  return { name: 'UnknownError', message: sanitize(String(error)) };
}

const isVerbose = (): boolean =>
  process.env.NODE_ENV !== 'production' || process.env.SERVER_LOG_VERBOSE === 'true';

// context: 어느 기능에서 난 오류인지 사람이 알아볼 짧은 설명 (예: 'Device registration failed')
export function logServerError(context: string, error: unknown): void {
  const summary = summarizeError(error);
  if (isVerbose() && error instanceof Error && error.stack) {
    console.error(`[server-error] ${sanitize(context)}`, summary, error.stack);
    return;
  }
  console.error(`[server-error] ${sanitize(context)}`, summary);
}
