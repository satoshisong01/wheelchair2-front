import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  // ‼️ [삭제] 'import type' 제거
} from 'typeorm';
// ‼️ [삭제] import type { Wheelchair } from './Wheelchair';

@Entity('maintenance_logs') // 테이블명: maintenance_logs
export class MaintenanceLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'report_date', type: 'date' })
  reportDate: Date; // 정비 신고/접수 날짜

  @Column({ type: 'text' })
  description: string; // 정비 내역

  @Column({ type: 'varchar', length: 100, nullable: true })
  technician: string | null; // 정비 담당자

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  // ‼️ [신규] 일관성을 위해 FK 컬럼 명시
  @Column({ name: 'wheelchair_id' })
  wheelchairId: number;

  // --- ‼️ [관계 수정] (wheelchair: Wheelchair) -> (wheelchair: any) ---
  @ManyToOne(
    'Wheelchair', // 문자열 사용
    (wheelchair: any) => wheelchair.maintenanceLogs, // ‼️ any 타입 사용
    {
      onDelete: 'CASCADE', // 휠체어 삭제 시 정비 이력도 삭제
    }
  )
  @JoinColumn({ name: 'wheelchair_id' })
  wheelchair: any; // ‼️ Wheelchair -> any
}
