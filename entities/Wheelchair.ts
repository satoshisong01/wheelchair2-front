import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

// 🚨 [수정] 모든 연관 엔티티를 'import type'으로 변경 (순환 참조 방지)
import type { WheelchairStatus } from './WheelchairStatus';
import type { Alarm } from './Alarm';
import type { User } from './User';
import type { DeviceAuth } from './DeviceAuth';
import type { MaintenanceLog } from './MaintenanceLog';

@Entity('wheelchairs')
export class Wheelchair {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'device_serial', unique: true })
  deviceSerial!: string;

  @Column({ name: 'model_name', nullable: true })
  modelName?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'physical_status', default: 'OPERATIONAL' })
  physicalStatus!: string;

  @Column({ name: 'manufactured_date', type: 'date', nullable: true })
  manufacturedDate?: Date;

  @Column({ name: 'purchase_date', type: 'date', nullable: true })
  purchaseDate?: Date;

  // --- Relations (모두 문자열로 변경) ---

  @OneToOne('WheelchairStatus', (status: any) => status.wheelchair)
  status?: WheelchairStatus;

  @OneToMany('Alarm', (alarm: any) => alarm.wheelchair)
  alarms?: Alarm[];

  @OneToOne('DeviceAuth', (auth: any) => auth.wheelchair)
  deviceAuth?: DeviceAuth;

  @OneToMany('MaintenanceLog', (log: any) => log.wheelchair)
  maintenanceLogs?: MaintenanceLog[];

  @ManyToOne('User', (user: any) => user.registeredWheelchairs)
  @JoinColumn({ name: 'registered_by_id' })
  registeredBy!: User;

  @Column({ name: 'registered_by_id', nullable: true })
  registeredById?: number;
}
