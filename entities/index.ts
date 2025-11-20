// 1. 핵심 엔티티 (+ UserRole 등 내부 Enum 자동 포함)
export * from './User';
export * from './Wheelchair';
export * from './DeviceAuth';
export * from './AdminAuditLog';

// 2. 데이터 및 로그 엔티티
export * from './WheelchairStatus';
export * from './Alarm';
export * from './MaintenanceLog';
export * from './MedicalInfo'; // 🚨 [복구] 이건 삭제하면 안 됩니다!

// ❌ 삭제된 파일들 (Role, Status, UserWheelchair)은 아예 줄을 지웠습니다.