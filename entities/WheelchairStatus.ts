import { Entity, PrimaryColumn, Column, OneToOne, JoinColumn } from 'typeorm';
// 🚨 [수정] 값(Class) import -> 타입(type) import로 변경하여 순환 참조 끊기
import type { Wheelchair } from './Wheelchair';

@Entity('wheelchair_status')
export class WheelchairStatus {
  @PrimaryColumn({ name: 'wheelchair_id', type: 'integer' })
  wheelchairId!: number;

  // 🚨 [수정] 관계 정의에서 클래스 대신 문자열 'Wheelchair' 사용
  @OneToOne('Wheelchair', (wheelchair: any) => wheelchair.status)
  @JoinColumn({ name: 'wheelchair_id' })
  wheelchair!: Wheelchair;

  @Column({ name: 'is_connected', default: false })
  isConnected!: boolean;

  @Column({ name: 'last_seen', type: 'timestamp', nullable: true })
  lastSeen!: Date | null;

  @Column({ name: 'battery_percent', type: 'float', default: 0 })
  batteryPercent!: number;

  @Column({ type: 'float', default: 0 })
  voltage!: number;

  @Column({ type: 'float', default: 0 })
  current!: number;

  @Column({ type: 'float', default: 0 })
  speed!: number;

  @Column({ type: 'float', default: 0 })
  distance!: number;

  @Column({ type: 'float', default: 0 })
  runtime!: number;

  @Column({ type: 'double precision', nullable: true })
  latitude!: number;

  @Column({ type: 'double precision', nullable: true })
  longitude!: number;

  @Column({ type: 'float', nullable: true })
  altitude!: number;

  @Column({ type: 'float', default: 0 })
  temperature!: number;

  @Column({ type: 'float', default: 0 })
  humidity!: number;

  @Column({ type: 'float', default: 0 })
  pressure!: number;

  @Column({ name: 'incline_angle', type: 'float', default: 0 })
  inclineAngle!: number;

  @Column({ name: 'angle_back', type: 'float', default: 0 })
  angleBack!: number;

  @Column({ name: 'angle_seat', type: 'float', default: 0 })
  angleSeat!: number;

  @Column({ name: 'foot_angle', type: 'float', default: 0 })
  footAngle!: number;

  @Column({ type: 'int', default: 0 })
  light!: number;

  @Column({ name: 'operatingTime', type: 'float', default: 0 })
  operatingTime!: number;

  @Column({ name: 'is_error', default: false })
  isError!: boolean;

  @Column({ name: 'is_fall', default: false })
  isFall!: boolean;

  @Column({ name: 'is_obstacle', default: false })
  isObstacle!: boolean;
}
