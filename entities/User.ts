import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
// 🚨 [유지] import type 유지 (순환 참조 방지)
import type { Wheelchair } from './Wheelchair';
import type { MedicalInfo } from './MedicalInfo';
import type { AdminAuditLog } from './AdminAuditLog';

export enum UserRole {
  MASTER = 'MASTER',
  ADMIN = 'ADMIN',
  PENDING = 'PENDING',
  REJECTED = 'REJECTED',
  // 필요하다면 USER = 'USER' 추가 가능
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'kakao_id', type: 'varchar', nullable: true, unique: true })
  kakaoId?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ name: 'nickname', nullable: true })
  name?: string;

  // ‼️ [추가] 프로필 이미지 저장을 위한 컬럼 (에러 해결의 핵심)
  @Column({ type: 'text', nullable: true })
  image?: string;

  @Column({
    type: 'varchar',
    default: UserRole.PENDING,
  })
  role!: UserRole;

  @Column({ nullable: true })
  organization?: string;

  @Column({ name: 'phoneNumber', nullable: true })
  phoneNumber?: string;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // --- Relations (기존 문자열 방식 유지) ---

  @OneToMany('Wheelchair', (wheelchair: any) => wheelchair.registeredBy)
  registeredWheelchairs?: Wheelchair[];

  @OneToMany('AdminAuditLog', (log: any) => log.adminUser)
  auditLogs?: AdminAuditLog[];

  @OneToOne('MedicalInfo', (medicalInfo: any) => medicalInfo.user)
  medicalInfo?: MedicalInfo;
}
