// 📍 경로: app/api/alerts/server-health/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { createAuditLog } from '@/lib/log'; // 기존 로그 함수 사용

// 서버 모니터링 스크립트가 POST 요청을 보낼 엔드포인트
export async function POST(req: NextRequest) {
  try {
    const { cpu_percent, memory_free_gb, alert_reason, server_id, process_info } = await req.json();

    // 1. 필수 입력값 검증 (최소한의 정보)
    if (!cpu_percent || !alert_reason || !server_id) {
      return NextResponse.json(
        { message: '필수 서버 상태 정보가 누락되었습니다.' },
        { status: 400 },
      );
    }

    // 2. 감사 로그 기록
    // userRole: 기존 ADMIN 역할로 기록 (권한 필터링을 타기 위해)
    // userId: 서버의 고유 ID를 사용
    const LOG_USER_ID = `SERVER-ALARM-${server_id}`;
    const LOG_USER_ROLE = 'ADMIN'; // ⭐️ [수정] ADMIN 역할로 통일 (SYSTEM 역할 미생성)

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
        process_snapshot: process_info || 'N/A',
        timestamp: new Date().toISOString(),
      },
      // 서버 식별자를 deviceSerial 필드에 저장
      deviceSerial: server_id,
    });

    // 3. 응답
    return NextResponse.json({
      message: '서버 비상 알림이 성공적으로 기록되었습니다.',
      logged_id: LOG_USER_ID,
    });
  } catch (error) {
    console.error('❌ [Server Health API Error]:', error);
    return NextResponse.json(
      { message: '로그 기록 중 서버 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
