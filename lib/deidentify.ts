// lib/deidentify.ts — 개인정보/보건의료정보 비식별화 유틸 (의료기기 사이버보안 요구사항 DC-02)
// 보건의료정보(장애등급·병력·응급연락처)는 저장 시 AES-256 암호화되며, 통계·AI 분석은 비식별 센서
// 데이터만 사용한다. 본 모듈은 로그·내보내기 등 2차 활용 경로에서 개인식별자를 비식별화하는 데 쓴다.

import { createHmac } from 'crypto';

const SALT = process.env.DEID_SALT || process.env.ENCRYPTION_SALT || 'deid';
if (SALT === 'deid' && process.env.NODE_ENV === 'production') {
  console.warn(
    '⚠️ [보안 경고] DEID_SALT/ENCRYPTION_SALT 미설정 — 비식별화가 고정 기본 솔트를 사용 중입니다. ' +
      '운영 환경에서는 .env에 16바이트 이상 랜덤 문자열로 설정하세요.',
  );
}

/** 이름 마스킹: 홍길동 → 홍*동 */
export function maskName(name?: string | null): string {
  if (!name) return '';
  if (name.length <= 1) return '*';
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

/** 전화번호 마스킹: 01012345678 → 010-****-5678 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  const d = String(phone).replace(/[^0-9]/g, '');
  if (d.length < 7) return '*'.repeat(d.length);
  return d.slice(0, 3) + '-****-' + d.slice(-4);
}

/** 이메일 마스킹: hong@x.com → ho**@x.com */
export function maskEmail(email?: string | null): string {
  if (!email || !email.includes('@')) return '';
  const [u, host] = email.split('@');
  const mu = u.length <= 2 ? u[0] + '*' : u.slice(0, 2) + '*'.repeat(Math.max(1, u.length - 2));
  return `${mu}@${host}`;
}

/** 가명 ID: 동일 입력 → 동일 가명(HMAC), 원본 재식별 불가. 통계 연결키 용도 */
export function pseudoId(value: string): string {
  return createHmac('sha256', SALT).update(String(value)).digest('hex').slice(0, 16);
}

const NAME_KEYS = /(name|이름|성명)/i;
const PHONE_KEYS = /(phone|tel|연락처|전화)/i;
const EMAIL_KEYS = /(email|메일)/i;
const CONTACT_KEYS = /(emergency|응급|contact)/i;

/** 객체에서 개인식별 가능 필드를 키 이름 기준으로 비식별화 (로그/내보내기 방어용) */
export function deidentifyDetails(details: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details || {})) {
    if (typeof v === 'string' && v) {
      if (PHONE_KEYS.test(k) || CONTACT_KEYS.test(k)) out[k] = maskPhone(v);
      else if (EMAIL_KEYS.test(k)) out[k] = maskEmail(v);
      else if (NAME_KEYS.test(k)) out[k] = maskName(v);
      else out[k] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}
