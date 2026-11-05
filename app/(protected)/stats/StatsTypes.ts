// 📍 경로: components/stats/StatsTypes.ts

export type MetricType = 'BATTERY' | 'SPEED' | 'DISTANCE';
export type TimeUnitType = 'daily' | 'hourly';
export type ChartModeType = 'RANGE' | 'COMPARE';

// ⭐️ [신규 타입] API에서 받아 프론트에서 사용할 통합 데이터 구조
export interface AggregatedData {
  date: string;
  source: string;
  avgBattery: number;
  maxBattery: number;
  avgSpeed: number;
  maxSpeed: number;
  avgDistance: number;
  maxDistance: number;
}

// ⭐️ [신규 타입] 테이블 표시용 데이터 구조
export interface TableRowData {
  date: string;
  deviceName: string;
  serial: string;
  battery: number;
  speed: number;
  distance: number;
}

// ⭐️ [신규 타입] Metric 설정 정의
export interface MetricConfigEntry {
  label: string;
  unit: string;
  color: string;
  colorCompare: string;
  bgColor: string;
  yMax: number | undefined;
}

export const METRIC_CONFIG: Record<MetricType, MetricConfigEntry> = {
  BATTERY: {
    label: '평균 배터리 잔량',
    unit: '%',
    color: '#27b4e9',
    colorCompare: '#f59231',
    bgColor: 'rgba(39, 180, 233, 0.2)',
    yMax: 100,
  },
  SPEED: {
    label: '평균 속도',
    unit: 'm/s',
    color: '#ff9f40',
    colorCompare: '#34d399',
    bgColor: 'rgba(255, 159, 64, 0.2)',
    yMax: undefined,
  },
  DISTANCE: {
    label: '주행 거리',
    unit: 'm',
    color: '#4bc0c0',
    colorCompare: '#a78bfa',
    bgColor: 'rgba(75, 192, 192, 0.2)',
    yMax: undefined,
  },
};

// ⭐️ [헬퍼 함수] 날짜 포맷팅
export const formatDateString = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// ⭐️ [상수] 시간 옵션 배열
export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));

// ⭐️ [타입] 디바이스 정보
export interface DeviceInfo {
  id: string;
  name: string;
}
