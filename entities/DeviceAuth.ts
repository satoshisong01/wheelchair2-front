import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn, // ‼️ [필수] JoinColumn 임포트 추가
  Index,
} from 'typeorm';
import type { Wheelchair } from './Wheelchair'; // import type 유지

@Entity('device_auths') // 테이블명 (복수형 권장)
export class DeviceAuth {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({
    name: 'device_id',
    type: 'varchar',
    length: 100,
    unique: true,
    nullable: false,
  })
  deviceId!: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  password!: string;

  // 1:1 관계 - 이 로그인 계정에 연결된 휠체어 (외래 키를 소유함)
  @OneToOne('Wheelchair', (wheelchair: any) => wheelchair.deviceAuth, {
    nullable: true,
    onDelete: 'CASCADE', // Wheelchair가 삭제되면 DeviceAuth도 삭제
  })
  @JoinColumn({ name: 'wheelchair_id' }) // 🚨 [필수] 외래 키가 있는 쪽에 명시
  wheelchair!: Wheelchair;

  // FK 컬럼도 명시적으로 선언 (JoinColumn의 이름과 일치)
  @Column({ name: 'wheelchair_id', nullable: true, unique: true })
  wheelchairId!: number | null;
}
