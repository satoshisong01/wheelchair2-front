// lib/crypto.ts
// 📝 설명: emergencyContact 필드 추가 및 타입 정의 보강

import {
  createCipheriv,
  createDecipheriv,
  scryptSync,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// .env 파일에서 키 가져오기
const secretKey = process.env.ENCRYPTION_KEY;

if (!secretKey || secretKey.length !== 32) {
  throw new Error(
    'ENCRYPTION_KEY가 .env 파일에 없거나 32바이트(32글자)가 아닙니다.'
  );
}

// 🔒 [보안] scrypt salt를 환경변수로 분리 (KTC 사이버보안 평가 대응)
// 기존 운영 환경 호환을 위해 fallback 'salt' 유지하되, 신규 환경에서는 16바이트 이상 랜덤값 권장
const ENCRYPTION_SALT = process.env.ENCRYPTION_SALT || 'salt';
if (ENCRYPTION_SALT === 'salt') {
  console.warn(
    '⚠️ [보안 경고] ENCRYPTION_SALT가 기본값으로 설정되어 있습니다. ' +
    '운영 환경에서는 .env에 16바이트 이상의 랜덤 문자열로 설정하는 것을 권장합니다.'
  );
}

// 키 변환 (scrypt)
const key = scryptSync(secretKey, ENCRYPTION_SALT, 32);

/**
 * 기본 암호화 함수
 */
export const encrypt = (text: string): string => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

/**
 * 기본 복호화 함수
 */
export const decrypt = (encryptedData: string): string => {
  try {
    const parts = encryptedData.split(':');
    if (parts.length < 2) {
      // 암호화되지 않은 평문이 들어왔을 경우 그대로 반환하거나 에러 처리
      return encryptedData;
    }
    const iv = Buffer.from(parts.shift() || '', 'hex');
    const encrypted = parts.join(':');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('복호화 실패:', error);
    return '데이터 오류';
  }
};

// ⭐️ [추가] 의료 정보 데이터 타입 정의 (emergencyContact 포함)
export interface MedicalInfoData {
  disabilityGrade?: string;
  medicalConditions?: string;
  emergencyContact?: string; // 👈 이 필드가 꼭 있어야 합니다!
}

/**
 * MedicalInfo 암호화 헬퍼 (emergencyContact 추가됨)
 */
export const encryptMedicalInfo = (data: MedicalInfoData) => {
  return {
    ...data,
    disabilityGrade: data.disabilityGrade
      ? encrypt(data.disabilityGrade)
      : undefined,
    medicalConditions: data.medicalConditions
      ? encrypt(data.medicalConditions)
      : undefined,
    // ⭐️ [추가] 비상연락망도 암호화
    emergencyContact: data.emergencyContact
      ? encrypt(data.emergencyContact)
      : undefined,
  };
};

/**
 * MedicalInfo 복호화 헬퍼 (emergencyContact 추가됨)
 */
export const decryptMedicalInfo = (data: MedicalInfoData) => {
  return {
    ...data,
    disabilityGrade: data.disabilityGrade
      ? decrypt(data.disabilityGrade)
      : undefined,
    medicalConditions: data.medicalConditions
      ? decrypt(data.medicalConditions)
      : undefined,
    // ⭐️ [추가] 비상연락망도 복호화
    emergencyContact: data.emergencyContact
      ? decrypt(data.emergencyContact)
      : undefined,
  };
};


