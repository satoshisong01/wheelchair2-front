// lib/login-lockout.ts — 로그인 연속 실패 시 계정 잠금 (의료기기 사이버보안 요구사항 IA-07)
// Upstash Redis 기반. Redis 미설정/장애 시에는 잠금을 적용하지 않고 통과(fail-open)하여
// 정상 사용자의 로그인을 차단하지 않는다. (무차별 대입은 미들웨어 Rate Limit으로 별도 방어)
// 키 접두어로 용도를 나눈다: 기기 로그인 'dev:<기기ID>', 비밀번호 변경의 현재 비밀번호 확인 'pwchg:<계정ID>'

import { Redis } from '@upstash/redis';

const MAX_FAILS = 5; // 연속 실패 허용 횟수
const LOCK_SECONDS = 10 * 60; // 잠금 시간(초) — 10분

let redis: Redis | null = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
      // 장애 시 빠르게 fail-open: 재시도 1회(0.1초) + 요청당 2초 제한
      // (기본값 5회 지수 백오프면 Upstash 장애 시 로그인 1회가 13초까지 지연됐음)
      retry: { retries: 1, backoff: () => 100 },
      signal: () => AbortSignal.timeout(2000),
    });
  }
} catch {
  redis = null;
}

/** 현재 잠금 상태인지 확인 */
export async function isLoginLocked(key: string): Promise<boolean> {
  if (!redis) return false;
  try {
    return !!(await redis.get(`login:lock:${key}`));
  } catch {
    return false; // fail-open
  }
}

/** 로그인 실패 1회 기록. 임계치 도달 시 잠금 설정 — 이번 실패로 잠겼으면 true (감사기록용) */
export async function recordLoginFailure(key: string): Promise<boolean> {
  if (!redis) return false;
  try {
    const n = await redis.incr(`login:fail:${key}`);
    if (n === 1) await redis.expire(`login:fail:${key}`, LOCK_SECONDS);
    if (n >= MAX_FAILS) {
      await redis.set(`login:lock:${key}`, '1', { ex: LOCK_SECONDS });
      return true;
    }
    return false;
  } catch {
    return false; // fail-open
  }
}

/** 로그인 성공 시 실패 카운트/잠금 해제 */
export async function resetLoginFailures(key: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(`login:fail:${key}`);
    await redis.del(`login:lock:${key}`);
  } catch {
    /* ignore */
  }
}
