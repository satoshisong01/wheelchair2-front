// 📍 경로: app/api/alerts/server-health/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { redis } from '@/lib/rate-limiter';
import { createAuditLog } from '@/lib/log'; // 기존 로그 함수 사용
import { z } from 'zod';
import { parseJsonBody } from '@/lib/validate';
import { logServerError } from '@/lib/server-log';
import { withRequestAudit } from '@/lib/api-audit';

// 감사로그 details에 남길 프로세스 스냅샷 최대 길이 (ps 상위 몇 줄이면 충분)
const MAX_PROCESS_INFO_LENGTH = 4096;

// 🔒 [보안] 요청 인증: 시크릿 원문은 보내지 않고, 모니터가 `시각.본문`을 시크릿으로 HMAC-SHA256 서명해 보낸다
//   - 서명 시각이 지금과 5분 넘게 차이 나면 거부, 같은 서명은 한 번만 받음(리플레이 차단)
//   - 서명 비교는 상수 시간(같은 길이의 해시로 바꿔 비교 — 일치 길이·길이 차이가 응답 시간으로 드러나지 않게)
const MAX_CLOCK_SKEW_SEC = 300;

function isValidSignature(timestamp: string | null, signature: string | null, body: string, secret: string): boolean {
  if (!timestamp || !signature || !/^\d{10}$/.test(timestamp)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > MAX_CLOCK_SKEW_SEC) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(signature), digest(expected));
}

// 이미 받은 서명이면 false — 허용 시간(앞뒤 5분)이 지나면 기록도 지움. Redis 장애 시엔 시각 검사만으로 받음(경보 유실 방지)
async function isFirstUse(signature: string): Promise<boolean> {
  try {
    const created = await redis.set(`health-sig:${signature}`, 1, { nx: true, ex: MAX_CLOCK_SKEW_SEC * 2 });
    return created === 'OK';
  } catch (error) {
    logServerError('Server health replay check unavailable', error);
    return true;
  }
}

// 🔒 감사로그에 남길 문자열의 제어문자 — 경보 사유는 한 줄로, ps 스냅샷은 표 모양(줄바꿈·탭)만 유지
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const CONTROL_CHARS_EXCEPT_LINE_BREAKS = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

// 서버 모니터링 스크립트가 POST 요청을 보낼 엔드포인트
// 🔒 [보안] SERVER_HEALTH_SECRET 으로 만든 서명 헤더로 인증 (외부 무인증 호출·재전송 차단)
async function handlePost(req: NextRequest) {
  try {
    // 1. [보안] 서명 검증 + 재사용 차단
    const HEALTH_SECRET = process.env.SERVER_HEALTH_SECRET;
    if (!HEALTH_SECRET) {
      console.error('[Server Health] SERVER_HEALTH_SECRET 환경변수가 설정되지 않았습니다.');
      return NextResponse.json({ message: '서버 설정 오류' }, { status: 500 });
    }
    const rawBody = await req.clone().text();
    const signature = req.headers.get('x-health-signature');
    if (
      !isValidSignature(req.headers.get('x-health-timestamp'), signature, rawBody, HEALTH_SECRET) ||
      !(await isFirstUse(signature as string))
    ) {
      return NextResponse.json({ message: '접근 권한이 없습니다.' }, { status: 403 });
    }

    // 2. 요청 body 파싱 + 검증 (정상 입력은 그대로 통과, 과대 크기/타입만 차단)
    const parsed = await parseJsonBody(
      req,
      z.object({
        cpu_percent: z.coerce.number(),
        memory_free_gb: z.coerce.number().nullish(),
        alert_reason: z.string().min(1).max(10000),
        server_id: z.string().min(1).max(100),
        // 🔒 ps 출력 문자열(또는 줄 배열)만 받음 — 길이 초과는 거부하지 않고 아래에서 잘라 저장(경보 유실 방지)
        process_info: z.union([z.string(), z.array(z.string())]).nullish(),
      }),
      '필수 서버 상태 정보가 누락되었습니다.',
    );
    if ('error' in parsed) return parsed.error;
    const { cpu_percent, memory_free_gb, server_id, process_info } = parsed.data;
    const alert_reason = parsed.data.alert_reason.replace(CONTROL_CHARS, ' ');
    const processSnapshot = process_info
      ? (Array.isArray(process_info) ? process_info.join('\n') : process_info)
          .replace(CONTROL_CHARS_EXCEPT_LINE_BREAKS, '')
          // 🔒 줄마다 앞 4칸(pid·CPU·메모리·실행 파일 이름)만 저장 — 이전 버전 모니터가 보낸 명령 인자는 버림
          .split('\n')
          .map((line) => line.trim().split(/\s+/).slice(0, 4).join(' '))
          .join('\n')
          .slice(0, MAX_PROCESS_INFO_LENGTH)
      : '';

    // 3. 감사 로그 기록
    // userRole: 사람(관리자) 행위와 구분되도록 SYSTEM 역할로 기록 (감사로그 조회는 역할 필터 없이 표시)
    // userId: 서버의 고유 ID를 사용
    const LOG_USER_ID = `SERVER-ALARM-${server_id}`;
    const LOG_USER_ROLE = 'SYSTEM';

    await createAuditLog({
      userId: LOG_USER_ID,
      userRole: LOG_USER_ROLE,
      // ACTION은 'SERVER_ALERT'로 고정하고, 상세 내용은 details에 저장
      action: 'SERVER_ALERT',
      details: {
        message: `🚨 ${alert_reason} (CPU: ${cpu_percent}%)`,
        cpu_usage: cpu_percent,
        memory_free: memory_free_gb,
        reason: alert_reason,
        process_snapshot: processSnapshot || 'N/A',
        timestamp: new Date().toISOString(),
      },
      // 서버 식별자를 deviceSerial 필드에 저장
      deviceSerial: server_id,
    });

    // 4. 응답
    return NextResponse.json({
      message: '서버 비상 알림이 성공적으로 기록되었습니다.',
      logged_id: LOG_USER_ID,
    });
  } catch (error) {
    logServerError('[Server Health API Error]', error);
    return NextResponse.json(
      { message: '로그 기록 중 서버 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

// 🔒 [UC-04] 오류 응답(4xx·5xx)은 감사기록 '요청 오류'로 남긴다 (lib/api-audit.ts)
export const POST = withRequestAudit(handlePost);
