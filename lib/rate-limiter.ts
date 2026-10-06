// lib/rate-limiter.ts (신규 생성)

import { Ratelimit } from '@upstash/ratelimit'; // ⬅️ 'Ratelimit' (er 없음)
import { Redis } from '@upstash/redis';

// .env.local 파일에서 키를 읽어와 Upstash Redis에 연결합니다.
// 재시도는 1회(0.1초)만 — 기본값(5회 지수 백오프, 약 4초)이면 Upstash 장애 시 인증 요청이 수 초씩 지연됨
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  retry: { retries: 1, backoff: () => 100 },
});

// "IP당 10초에 10회" 규칙을 설정합니다.
// (10초 안에 11번째 요청이 오면 차단합니다.)
export const rateLimiter = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: true, // Upstash 대시보드에서 차단 내역을 볼 수 있게 함
});
