// lib/format.ts
// 센서/기기 값 표시 헬퍼.
// 핵심 원칙: 데이터가 없을 때(null/undefined/'' /NaN)는 '0'이 아니라 '-'로 표시한다.
//           실제로 측정된 0만 '0'으로 보여준다.

export const NO_DATA = '-';

/** 표시 가능한 실측값인지 (null/undefined/빈문자열/NaN 이면 false) */
export function hasValue(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false;
  return !Number.isNaN(Number(v));
}

/** 숫자 표시. 데이터 없으면 '-'. digits 지정 시 소수 자릿수 고정. */
export function fmtNum(v: unknown, digits?: number): string {
  if (!hasValue(v)) return NO_DATA;
  const n = Number(v);
  return digits != null ? n.toFixed(digits) : String(n);
}

/** 단위 포함 숫자 표시. 데이터 없으면 '-'. unit 에 앞 공백을 포함시켜 호출(예: ' V'). */
export function fmtUnit(v: unknown, unit = '', digits = 1): string {
  if (!hasValue(v)) return NO_DATA;
  return `${Number(v).toFixed(digits)}${unit}`;
}

/** 천 단위 구분 + 단위. 데이터 없으면 '-'. (거리 등) */
export function fmtDist(v: unknown, unit = ' m', digits = 1): string {
  if (!hasValue(v)) return NO_DATA;
  const s = Number(v).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${s}${unit}`;
}

/** 분 단위 시간 표시. 데이터 없으면 '-'. (예: "1 h 5 min") */
export function fmtMinutes(v: unknown): string {
  if (!hasValue(v)) return NO_DATA;
  const num = Number(v);
  const h = Math.floor(num / 60);
  const m = Math.floor(num % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** 퍼센트 표시. 데이터 없으면 '-'. (예: "87%") */
export function fmtPercent(v: unknown, digits = 0): string {
  if (!hasValue(v)) return NO_DATA;
  return `${Number(v).toFixed(digits)}%`;
}
