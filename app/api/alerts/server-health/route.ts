// 📍 경로: app/api/alerts/server-health/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { createAuditLog } from '@/lib/log'; // 기존 로그 함수 사용
import { z } from 'zod';
import { parseJsonBody } from '@/lib/validate';
import { logServerError } from '@/lib/server-log';

// 감사로그 details에 남길 프로세스 스냅샷 최대 길이 (ps 상위 몇 줄이면 충분)
const MAX_PROCESS_INFO_LENGTH = 4096;

// 🔒 [보안] 시크릿은 상수 시간으로 비교 — 일치하는 앞부분 길이가 응답 시간으로 드러나지 않게
//   (양쪽을 같은 길이의 해시로 바꿔 비교하므로 길이 차이도 드러나지 않음)
function isValidSecret(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

// 🔒 감사로그에 남길 문자열의 제어문자 — 경보 사유는 한 줄로, ps 스냅샷은 표 모양(줄바꿈·탭)만 유지
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const CONTROL_CHARS_EXCEPT_LINE_BREAKS = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

// 서버 모니터링 스크립트가 POST 요청을 보낼 엔드포인트
// 🔒 [보안] SERVER_HEALTH_SECRET 헤더로 인증 (외부 무인증 호출 차단)
export async function POST(req: NextRequest) {
  try {
    // 1. [보안] 공유 시크릿 검증
    const HEALTH_SECRET = process.env.SERVER_HEALTH_SECRET;
    if (!HEALTH_SECRET) {
      console.error('[Server Health] SERVER_HEALTH_SECRET 환경변수가 설정되지 않았습니다.');
      return NextResponse.json({ message: '서버 설정 오류' }, { status: 500 });
    }
    const providedSecret = req.headers.get('x-health-secret');
    if (!isValidSecret(providedSecret, HEALTH_SECRET)) {
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
