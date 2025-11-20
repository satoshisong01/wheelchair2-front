import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
// ‼️ [삭제] User 임포트 제거 (순환 참조 방지)
// import { User } from './User';

// ‼️ [신규] 관리자 활동 로그 Enum
export enum AdminAuditLogAction {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  DEVICE_CREATE = 'DEVICE_CREATE',
  DEVICE_DELETE = 'DEVICE_DELETE',
  ADMIN_APPROVE = 'ADMIN_APPROVE',
  ADMIN_REJECT = 'ADMIN_REJECT',
}

@Entity('admin_audit_logs') // 테이블명
export class AdminAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ name: 'timestamp' }) // ‼️ TypeORM의 CreateDateColumn 사용
  timestamp: Date;

  @Column({
    type: 'enum',
    enum: AdminAuditLogAction,
    nullable: false,
  })
  actionType: AdminAuditLogAction; // ‼️ 'LOGIN', 'DEVICE_CREATE' 등

  @Column({
    type: 'varchar',
    length: 500, // ‼️ 로그 내용을 저장하기에 충분한 길이
    nullable: false,
  })
  details: string; // ‼️ 예: "Device 'WC-001' (ID: 12) 생성"

  // ‼️ N:1 관계 - 이 로그를 발생시킨 관리자
  @ManyToOne(
    'User', // ‼️ 'User' 문자열 사용
    (user: any) => user.auditLogs, // ‼️ (user: any) 사용
    {
      nullable: false, // 모든 로그는 관리자가 있어야 함
      onDelete: 'CASCADE', // ‼️ 관리자가 (드물게) 삭제되면 로그도 함께 삭제
    }
  )
  @JoinColumn({ name: 'admin_user_id' })
  adminUser: any; // ‼️ User -> any

  @Column({ name: 'admin_user_id' })
  adminUserId: number; // ‼️ FK
}
