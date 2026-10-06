// lib/alarm-categories.ts — 경고/알림 EVENT 분류 기준 (대시보드 목록·모달과 /api/alarms category 필터가 공유)

export type AlarmCategory = 'critical' | 'info';

// /api/alarms가 LIKE '%키워드%' 패턴으로도 쓰므로 키워드에 %, _ 는 넣지 말 것
export const CRITICAL_ALARM_KEYWORDS: readonly string[] = [
  'FALL',
  'CRITICAL',
  'EMERGENCY',
  'WARNING',
  'FATAL',
  'ROLLOVER',
];

/** alarmType에 경고 키워드가 포함되면 경고 EVENT (대소문자 구분, 값이 없으면 알림 EVENT) */
export function isCriticalAlarmType(alarmType?: string | null): boolean {
  const type = alarmType || '';
  return CRITICAL_ALARM_KEYWORDS.some((keyword) => type.includes(keyword));
}
