// lib/rate-limiter.ts (신규 생성)

import { Ratelimit } from '@upstash/ratelimit'; // ⬅️ 'Ratelimit' (er 없음)
import { Redis } from '@upstash/redis';

// .env.local 파일에서 키를 읽어와 Upstash Redis에 연결합니다.
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// "IP당 10초에 10회" 규칙을 설정합니다.
// (10초 안에 11번째 요청이 오면 차단합니다.)
export const rateLimiter = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: true, // Upstash 대시보드에서 차단 내역을 볼 수 있게 함
});
