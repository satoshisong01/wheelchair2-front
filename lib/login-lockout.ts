// lib/login-lockout.ts — 로그인 연속 실패 시 계정 잠금 (의료기기 사이버보안 요구사항 IA-07)
// Upstash Redis 기반. Redis 미설정/장애 시에는 잠금을 적용하지 않고 통과(fail-open)하여
// 정상 사용자의 로그인을 차단하지 않는다. (무차별 대입은 미들웨어 Rate Limit으로 별도 방어)

import { Redis } from '@upstash/redis';

const MAX_FAILS = 5; // 연속 실패 허용 횟수
const LOCK_SECONDS = 10 * 60; // 잠금 시간(초) — 10분

let redis: Redis | null = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
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

/** 로그인 실패 1회 기록. 임계치 도달 시 잠금 설정 */
export async function recordLoginFailure(key: string): Promise<void> {
  if (!redis) return;
  try {
    const n = await redis.incr(`login:fail:${key}`);
    if (n === 1) await redis.expire(`login:fail:${key}`, LOCK_SECONDS);
    if (n >= MAX_FAILS) await redis.set(`login:lock:${key}`, '1', { ex: LOCK_SECONDS });
  } catch {
    /* fail-open */
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
