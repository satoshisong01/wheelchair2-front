import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User';

@Entity('medical_info')
export class MedicalInfo {
  @PrimaryGeneratedColumn()
  id!: number;

  // 🚨 [핵심] AES-256 암호화된 데이터가 통째로 들어가는 컬럼
  @Column({ name: 'encrypted_data', type: 'text' })
  encryptedData!: string;

  // 🚨 [핵심] 암호화 복호화에 필수적인 초기화 벡터(IV)
  @Column({ name: 'iv', type: 'varchar', length: 32 })
  iv!: string;

  @Column({ name: 'user_id', unique: true })
  userId!: number;

  // 🚨 [수정] 단방향 관계 (User 쪽에는 medicalInfo가 없으므로 두 번째 인자 제거)
  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
