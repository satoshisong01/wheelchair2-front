// 📍 경로: lib/log.ts (새로 생성)

import { query } from '@/lib/db'; 

interface LogData {
    userId: string;
    userRole: string;
    action: 'LOGIN' | 'LOGOUT' | 'DEVICE_REGISTER' | 'DEVICE_DELETE' | 'USER_UPDATE' | string;
    details: Record<string, any>;
}

export const createAuditLog = async ({ userId, userRole, action, details }: LogData) => {
    try {
        if (!['ADMIN', 'MASTER'].includes(userRole)) {
            return; // ADMIN/MASTER만 로그 기록
        }

        // Raw SQL: admin_audit_logs 테이블에 로그 INSERT
        const sql = `
            INSERT INTO admin_audit_logs (user_id, user_role, action, details, created_at)
            VALUES ($1, $2, $3, $4, NOW());
        `;
        // details 객체를 PostgreSQL의 JSONB 타입에 맞게 JSON 문자열로 변환하여 저장
        await query(sql, [userId, userRole, action, JSON.stringify(details)]);

    } catch (error) {
        console.error('❌ Audit Log Creation Failed:', error);
    }
};