// 📍 경로: lib/log.ts (최종 확인 및 오류 처리 강화)

import { query } from '@/lib/db';

interface LogData {
  userId: string;
  userRole: string;
  action: 'LOGIN' | 'LOGOUT' | 'DEVICE_REGISTER' | 'DEVICE_DELETE' | 'USER_UPDATE' | string;
  details: Record<string, any>;
  deviceSerial?: string;
}

export const createAuditLog = async ({
  userId,
  userRole,
  action,
  details,
  deviceSerial,
}: LogData) => {
  try {
    if (!['ADMIN', 'MASTER', 'DEVICE_USER'].includes(userRole)) {
      return;
    }

    // ⭐️ [개선] deviceSerial이 null이면 빈 문자열로 변환 (DB 제약조건 회피)
    const finalDeviceSerial = deviceSerial || null;

    // Raw SQL: admin_audit_logs 테이블에 로그 INSERT
    const sql = `
            INSERT INTO admin_audit_logs (user_id, user_role, action, details, device_serial, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW());
        `;

    // details 객체를 JSON 문자열로 변환하여 저장
    await query(sql, [
      userId,
      userRole,
      action,
      JSON.stringify(details),
      finalDeviceSerial, // ⭐️ NULL 가능하도록 처리
    ]);

    console.log(
      `✅ [Audit Log Success] ${userRole} ${action} recorded (User: ${userId}, Device: ${finalDeviceSerial})`,
    );
  } catch (error) {
    // ⭐️ [강화된 에러 출력] DB 오류 코드를 포함하여 출력
    console.error(`❌ Audit Log Creation Failed (${userRole} - ${action}):`, {
      message: (error as Error).message,
      code: (error as any).code || 'N/A',
      details: details,
    });
  }
};
