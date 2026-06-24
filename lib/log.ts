// 📍 경로: lib/log.ts (최종 수정 전체 코드)

import { query } from '@/lib/db';
import { deidentifyDetails } from '@/lib/deidentify'; // 🔒 [DC-02] 로그 내 개인식별자 비식별화

interface LogData {
  userId: string;
  userRole: string;
  action: 'LOGIN' | 'LOGOUT' | 'DEVICE_REGISTER' | 'DEVICE_DELETE' | 'USER_UPDATE' | string;
  details: Record<string, unknown>;
  deviceSerial?: string;
  userName?: string; // ⭐️ [추가] user_name 필드 추가
}

export const createAuditLog = async ({
  userId,
  userRole,
  action,
  details,
  deviceSerial,
  userName, // ⭐️ [추가] userName 매개변수 받기
}: LogData) => {
  // ⭐️ [핵심 수정 1] SYSTEM 역할을 허용합니다.
  if (!['ADMIN', 'MASTER', 'DEVICE_USER', 'SYSTEM'].includes(userRole)) {
    return;
  }

  const finalDeviceSerial = deviceSerial || null;
  const finalUserName = userName || null; // ⭐️ [추가] userName이 없으면 null
  // 🔒 [DC-02] details 내 개인식별자(이름/전화/이메일/응급연락처)를 비식별화하여 저장
  const safeDetails = deidentifyDetails(details || {});

  // Raw SQL: admin_audit_logs 테이블에 로그 INSERT
  const sql = `
            INSERT INTO admin_audit_logs (user_id, user_role, action, details, device_serial, user_name, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW());
        `;
  const params = [userId, userRole, action, JSON.stringify(safeDetails), finalDeviceSerial, finalUserName];

  // 🔒 [UC-05] 감사 처리 실패 대응: 1회 재시도 후, 끝내 실패 시 고경보 마커 로그(모니터링 감지용).
  // 감사 기록 실패가 본 작업(로그인/기기관리 등)을 중단시키지 않도록 예외를 전파하지 않는다.
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await query(sql, params);
      // 🔒 [보안] 운영 환경에서 userId/deviceSerial 노출 방지
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `✅ [Audit Log Success] ${userRole} ${action} recorded (User: ${userId}, Device: ${finalDeviceSerial})`,
        );
      } else {
        console.log(`✅ [Audit Log Success] ${userRole} ${action} recorded`);
      }
      return;
    } catch (error) {
      lastErr = error;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 200)); // 짧은 백오프 후 재시도
    }
  }

  // 재시도까지 실패 → 감사 처리 실패 대응(별도 마커로 출력하여 server-monitor/CloudWatch가 알림)
  console.error('🚨 [AUDIT-FAILURE] 감사 로그 기록 실패 — 즉시 확인 필요', {
    action,
    userRole,
    code: (lastErr as { code?: string } | null)?.code || 'N/A',
    message: (lastErr as Error)?.message,
  });
};
