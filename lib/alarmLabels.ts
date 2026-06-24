// lib/alarmLabels.ts — 경고(알람) 유형 한글 라벨 (worker.ts의 alarmType 정의 기준)

const ALARM_LABELS: Record<string, string> = {
  FALL: '낙상 감지',
  ROLLOVER: '전복 감지',
  SLOPE_WARNING: '급경사 경고',
  SLOPE: '급경사 경고',
  OBSTACLE: '장애물 감지',
  LOW_VOLTAGE: '배터리 저전압',
  POSTURE_ADVICE: '자세 변경 권고',
  POSTURE_COMPLETE: '자세 변경 완료',
  EMERGENCY: '응급 상황',
};

/** 경고 유형 코드(SLOPE_WARNING 등)를 한글 라벨로 변환. 미정의 시 원본 반환 */
export function getAlarmTypeLabel(type?: string): string {
  if (!type) return '알 수 없는 경고';
  return ALARM_LABELS[type.toUpperCase()] || type;
}
