// 📍 경로: lib/log.ts (최종 수정 전체 코드)

import { query } from '@/lib/db';

interface LogData {
  userId: string;
  userRole: string;
  action: 'LOGIN' | 'LOGOUT' | 'DEVICE_REGISTER' | 'DEVICE_DELETE' | 'USER_UPDATE' | string;
  details: Record<string, any>;
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
  try {
    // ⭐️ [핵심 수정 1] SYSTEM 역할을 허용합니다.
    if (!['ADMIN', 'MASTER', 'DEVICE_USER', 'SYSTEM'].includes(userRole)) {
      return;
    }

    const finalDeviceSerial = deviceSerial || null;
    const finalUserName = userName || null; // ⭐️ [추가] userName이 없으면 null

    // Raw SQL: admin_audit_logs 테이블에 로그 INSERT
    // ⭐️ [핵심 수정 2] user_name 컬럼 추가
    const sql = `
            INSERT INTO admin_audit_logs (user_id, user_role, action, details, device_serial, user_name, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW());
        `;

    // details 객체를 JSON 문자열로 변환하여 저장
    await query(sql, [
      userId,
      userRole,
      action,
      JSON.stringify(details),
      finalDeviceSerial,
      finalUserName, // ⭐️ [추가] user_name 값 전달
    ]);

    // 🔒 [보안] 운영 환경에서 userId/deviceSerial 노출 방지
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `✅ [Audit Log Success] ${userRole} ${action} recorded (User: ${userId}, Device: ${finalDeviceSerial})`,
      );
    } else {
      console.log(`✅ [Audit Log Success] ${userRole} ${action} recorded`);
    }
  } catch (error) {
    console.error(`❌ Audit Log Creation Failed (${userRole} - ${action}):`, {
      message: (error as Error).message,
      code: (error as any).code || 'N/A',
      details: details,
    });
  }
};
