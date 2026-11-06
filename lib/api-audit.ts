// lib/api-audit.ts — API 오류 응답(4xx·5xx) 감사기록 (의료기기 사이버보안 요구사항 UC-04 '요청 오류')
// 라우트 핸들러를 감싸, 응답 상태가 400 이상이거나 처리 중 예외가 나면 REQUEST_ERROR 이벤트를 남긴다.
// - 기록은 응답을 보낸 뒤(after) 해서 오류 응답을 늦추지 않는다
// - 같은 출처(로그인 계정, 비로그인은 IP)·경로·상태의 오류는 1분에 한 번만 기록 — 무차별 요청으로 감사로그가 넘치지 않게
//   (Redis 미설정·장애 시에는 거르지 않고 모두 기록)
// - 비로그인 요청도 남긴다(행위자 ANONYMOUS + 접속 IP). 로그인 처리(/api/auth/[...nextauth])는 감싸지 않는다

import { after, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { auditRoleOf } from '@/lib/authOptions';
import { createAuditLog } from '@/lib/log';
import { redis } from '@/lib/rate-limiter';

const DEDUP_WINDOW_SEC = 60;

type RouteHandler = (req: NextRequest, ...rest: never[]) => Promise<Response>;

// middleware.ts getClientIp와 같은 규칙 — 프록시가 실제 연결 IP로 넣는 x-real-ip 우선
function clientIp(req: NextRequest): string {
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri.trim();
  const xff = req.headers.get('x-forwarded-for');
  return xff ? xff.split(',')[0].trim() : 'unknown';
}

async function isFirstInWindow(key: string): Promise<boolean> {
  try {
    return (await redis.set(key, '1', { nx: true, ex: DEDUP_WINDOW_SEC })) === 'OK';
  } catch {
    return true; // Redis 장애 시 거르지 않고 기록
  }
}

async function auditRequestError(req: NextRequest, httpStatus: number): Promise<void> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }).catch(() => null);
  const userId = token?.id ?? 'ANONYMOUS';
  const ip = clientIp(req);
  const path = req.nextUrl.pathname; // 쿼리 문자열은 남기지 않음
  const source = token?.id ?? ip;
  if (!(await isFirstInWindow(`audit:reqerr:${source}:${req.method}:${path}:${httpStatus}`))) return;

  await createAuditLog({
    userId,
    userRole: auditRoleOf(token?.role),
    action: 'REQUEST_ERROR',
    details: {
      status: 'Failed',
      method: req.method,
      path,
      httpStatus,
      ip,
      role: token?.role ?? 'ANONYMOUS',
    },
    deviceSerial: token?.deviceId,
    userName: token?.name ?? undefined,
  });
}

/** 라우트 핸들러를 감싸 오류 응답을 감사기록으로 남긴다 — 핸들러의 호출 형태(인자·반환)는 그대로 둔다 */
export function withRequestAudit<H extends RouteHandler>(handler: H): H {
  const wrapped = async (req: NextRequest, ...rest: never[]): Promise<Response> => {
    try {
      const res = await handler(req, ...rest);
      if (res.status >= 400) after(() => auditRequestError(req, res.status));
      return res;
    } catch (error) {
      after(() => auditRequestError(req, 500));
      throw error;
    }
  };
  return wrapped as H;
}
