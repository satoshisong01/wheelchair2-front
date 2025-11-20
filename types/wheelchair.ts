/**
 * 휠체어 기본 정보
 */
export interface Wheelchair {
  id: number;
  deviceSerial: string;
  modelName?: string;
  createdAt: Date;
}

/**
 * 휠체어 실시간 상태 (WheelchairStatus 테이블)
 */
export interface WheelchairStatus {
  wheelchairId?: number;
  statusId?: number;
  isConnected?: boolean;
  lastSeen?: Date;
  batteryPercent?: number;
  voltage?: number;
  current?: number;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  speed?: number;
  inclineAngle?: number;
  distance?: number;
  runtime?: number;
  angleBack?: number;
  angleSeat?: number;
  footAngle?: number;
}

// (MQTTWheelchairData, Alarm, User, Role, MedicalInfo, UserWheelchair... 등)
// (... 1인 개발자님의 다른 인터페이스들은 모두 여기에 그대로 둡니다 ...)
export interface MQTTWheelchairData {
  deviceId: string;
  imei?: string;
  voltage?: number;
  current?: number;
  speed?: number;
  batteryPercent?: number;
  latitude?: number;
  longitude?: number;
  temperature?: number;
  timestamp: Date;
}
export interface Alarm {
  id: number;
  wheelchairId: number;
  imei?: string;
  alarmType: string;
  alarmCondition: string;
  alarmStatus: 'active' | 'resolved';
  statusId: number;
  alarmTime: Date;
  wheelchair?: {
    id: number;
    deviceSerial: string;
    modelName?: string;
    createdAt: Date;
  };
}
export interface User {
  id: number;
  kakaoId: string;
  email?: string;
  nickname?: string;
  roleId: number;
  createdAt: Date;
}
export interface Role {
  id: number;
  roleName: string;
  canViewBattery: boolean;
  canViewAlerts: boolean;
  canViewLocation: boolean;
  canViewMedicalInfo: boolean;
}
export interface MedicalInfo {
  id: number;
  userId: number;
  disabilityGrade: string; // 암호화된 데이터
  medicalConditions: string; // 암호화된 데이터
  createdAt: Date;
  updatedAt?: Date;
}
export interface UserWheelchair {
  userId: number;
  wheelchairId: number;
  name: string; // 사용자가 붙인 휠체어 별명
}
export interface StatisticsParams {
  deviceId: string;
  startDate: string;
  endDate: string;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
}
export interface StatisticsData {
  date: string;
  batteryPercent: number;
  voltage: number;
  distance: number;
  runtime: number;
}

/**
 * 대시보드용 휠체어 데이터 타입
 * [‼️‼️‼️ 여기를 수정했습니다 ‼️‼️‼️]
 * (API가 /api/wheelchairs에서 반환하는 최종 형태)
 */
export interface DashboardWheelchair extends Wheelchair {
  // [수정 1] Wheelchair 타입을 상속받아 id, deviceSerial, modelName 등을 포함

  // [수정 2] status는 휠체어에 포함된 '객체'
  status?: WheelchairStatus | null; // [수정 3] user_wheelchair 테이블에서 가져온 '별명'

  nickname?: string | null;

  // ‼️ [신규 추가] 휠체어와 연결된 사용자(User 엔티티) 목록
  // (User 인터페이스 69라인을 참고하여 'nickname' 사용)
  users?: {
    nickname: string;
  }[];
}

export interface TimestreamStat {
  binned_time: string; // (d.binned_time)
  avg_voltage: number; // (d.avg_voltage)
  avg_speed: number; // (d.avg_speed) // (나중에 추가될 다른 통계 값, 예: avg_current?: number)
}
