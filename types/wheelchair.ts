/**
 * 휠체어 기본 정보 (deviceSerial -> device_serial)
 */
export interface Wheelchair {
  id: string; // ✅ DB UUID에 맞춰 number에서 string으로 변경
  device_serial: string; // ✅ FIX: deviceSerial -> device_serial
  model_name?: string | null; // ✅ DB NULL 허용
  created_at: Date | string; // ✅ DB 타입 유연성 확보
}

/**
 * 휠체어 실시간 상태 (Worker/DB 캐시 구조)
 * ✅ FIX: batteryPercent, speed 등 CamelCase를 DB 컬럼명으로 변경
 */
export interface WheelchairStatus {
  wheelchairId?: string; // ✅ DB UUID에 맞춰 number에서 string으로 변경

  // ⭐️ [FIXED METRICS] Worker가 DB에 저장하는 실제 컬럼명 사용
  current_battery?: number | null;
  current_speed?: number | null;
  current_amperage?: number | null;
  last_seen?: Date | string | null;

  // 기존 MQTT 데이터 구조 중 필요한 것만 유지
  voltage?: number | null;
  current?: number | null;
  latitude?: number | null;
  longitude?: number | null;

  // (이하 나머지 필드는 DB 컬럼명에 맞춰 유지)
  altitude?: number | null;
  temperature?: number | null;
  humidity?: number | null;
  pressure?: number | null;
  inclineAngle?: number | null;
  distance?: number | null;
  runtime?: number | null;
  angleBack?: number | null;
  angleSeat?: number | null;
  footAngle?: number | null;
}

// ---------------------------------------------------------------------

/**
 * 대시보드용 휠체어 데이터 타입
 * (API가 /api/wheelchairs에서 반환하는 최종 형태)
 */
export interface DashboardWheelchair extends Wheelchair {
  // ✅ FIX: status는 Worker가 쓰는 WheelchairStatus 인터페이스를 참조
  status?: WheelchairStatus | null;

  nickname?: string | null;

  // ✅ FIX: 등록자 정보 (API에서 LEFT JOIN으로 가져온 데이터)
  registrant: {
    name: string | null;
    email: string | null;
  } | null;

  users?: {
    nickname: string;
  }[];
  // users 필드는 DB에서 N:M 관계로 오지만, 현재 API에서 사용하지 않으므로 간소화
  // users?: { nickname: string; }[];
}

// ---------------------------------------------------------------------

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
    device_serial: string; // ✅ FIX: deviceSerial -> device_serial
    model_Name?: string;
    created_at: Date;
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
  disabilityGrade: string;
  medicalConditions: string;
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
export interface TimestreamStat {
  binned_time: string; // (d.binned_time)
  avg_voltage: number; // (d.avg_voltage)
  avg_speed: number; // (d.avg_speed) // (나중에 추가될 다른 통계 값, 예: avg_current?: number)
}
