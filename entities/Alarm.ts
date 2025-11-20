import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn, // ‼️ [수정] CreateDateColumn 사용
} from 'typeorm';
// ‼️ [삭제] import { Status } from './Status';
// ‼️ [삭제] import type { Wheelchair } from './Wheelchair'; (문자열 방식에서는 불필요)

/**
 * 알람/경고 정보
 */
@Entity('alarms')
export class Alarm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'wheelchair_id', type: 'integer', nullable: false }) // ‼️ [수정] bigint -> integer (Wheelchair.id와 타입 일치)
  wheelchairId: number;

  // ‼️ [삭제] imei 컬럼 (Wheelchair.deviceSerial로 통일)
  // @Column({ type: 'varchar', length: 50, nullable: true })
  // imei?: string;

  @Column({ name: 'alarm_type', type: 'varchar', length: 100, nullable: false })
  alarmType: string;

  @Column({
    name: 'alarm_condition',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  alarmCondition?: string; // ‼️ [수정] message 필드로 통합 (다음 스키마에서)

  @Column({
    name: 'alarm_status',
    type: 'varchar',
    length: 50,
    default: 'active',
  })
  alarmStatus: 'active' | 'resolved';

  // ‼️ [삭제] Status 관계 필드
  // @Column({ name: 'status_id', type: 'integer', nullable: true })
  // statusId?: number;

  @CreateDateColumn({ name: 'alarm_time' }) // ‼️ [수정] TypeORM 방식
  alarmTime: Date;

  // --- Relations ---

  // ‼️ [수정] (wheelchair: Wheelchair) -> (wheelchair: any)
  @ManyToOne('Wheelchair', (wheelchair: any) => wheelchair.alarms, {
    onDelete: 'CASCADE', // ‼️ 휠체어 삭제 시 관련 알람도 삭제
  })
  @JoinColumn({ name: 'wheelchair_id' })
  wheelchair: any; // ‼️ Wheelchair -> any

  // ‼️ [삭제] Status 관계
  // @ManyToOne(() => Status)
  // @JoinColumn({ name: 'status_id' })
  // status?: Status;
}
