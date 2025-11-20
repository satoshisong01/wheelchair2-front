import { DataSource } from 'typeorm';
import 'reflect-metadata';

// 1. 엔티티 정적 임포트 (모든 엔티티를 명시적으로 가져옴)
// 🚨 이렇게 하면 "User#medicalInfo metadata not found" 에러가 해결됩니다.
import { User } from '@/entities/User';
import { Wheelchair } from '@/entities/Wheelchair';
import { WheelchairStatus } from '@/entities/WheelchairStatus';
import { Alarm } from '@/entities/Alarm';
import { DeviceAuth } from '@/entities/DeviceAuth';
import { AdminAuditLog } from '@/entities/AdminAuditLog';
import { MaintenanceLog } from '@/entities/MaintenanceLog';
import { MedicalInfo } from '@/entities/MedicalInfo'; // 🚨 [필수] 누락되었던 엔티티 복구

// 2. DataSource 설정
export const AppDataSource = new DataSource({
  type: 'postgres',
  // 로컬 .env 파일에서 DB 정보 읽기 (우선순위: DATABASE_HOST > DB_HOST > localhost)
  host: process.env.DATABASE_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || process.env.DB_PORT || '5432'),
  username:
    process.env.DATABASE_USERNAME || process.env.DB_USERNAME || 'postgres',
  password:
    process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || process.env.DB_NAME || 'postgres',

  // 🚨 AWS RDS 연결 시 SSL 필수 (로컬 -> RDS 접속 시 필요)
  ssl:
    process.env.DATABASE_HOST?.includes('rds.amazonaws.com') ||
    process.env.DB_HOST?.includes('rds.amazonaws.com')
      ? { rejectUnauthorized: false }
      : false,

  // 🚨 [주의] 로컬 개발환경에서는 true로 해서 테이블을 자동 수정하게 둡니다.
  synchronize: false,

  logging: false,

  // 3. 엔티티 목록 명시 (여기에 MedicalInfo가 꼭 있어야 함!)
  entities: [
    User,
    Wheelchair,
    WheelchairStatus,
    Alarm,
    DeviceAuth,
    AdminAuditLog,
    MaintenanceLog,
    MedicalInfo,
  ],
  subscribers: [],
  migrations: [],
});

// 4. 연결 함수
export const connectDatabase = async () => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
    console.log('✅ Database connected successfully');
  }
  return AppDataSource;
};
