// lib/crypto.ts (보안 및 버그 수정 완료)

import {
  createCipheriv,
  createDecipheriv,
  scryptSync, // [수정 1] scryptSync 추가
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // AES-256-CBC의 IV 길이는 16바이트입니다.

// [수정 2] .env.local 파일에서 비밀 키를 *엄격하게* 가져옵니다.
const secretKey = process.env.ENCRYPTION_KEY;

// [수정 3] ‼️ 키가 없거나 32바이트가 아니면 즉시 서버를 중단시킵니다.
// (이래야 배포 환경에서 키가 누락되는 치명적인 실수를 막을 수 있습니다.)
if (!secretKey || secretKey.length !== 32) {
  throw new Error(
    'ENCRYPTION_KEY가 .env.local 파일에 없거나 32바이트(32글자)가 아닙니다.'
  );
}

// [수정 4] ‼️ .env 키(비밀번호)를 'scrypt'를 사용해 32바이트 암호화 키(버퍼)로 변환합니다.
// (Cursor AI의 'Buffer.from' 방식보다 훨씬 강력하고 표준적인 방식입니다.)
const key = scryptSync(secretKey, 'salt', 32);

/**
 * 데이터 암호화
 */
export const encrypt = (text: string): string => {
  const iv = randomBytes(IV_LENGTH);

  // [수정 5] 'key' 변수는 이미 scrypt로 생성된 32바이트 버퍼입니다.
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
};

/**
 * 데이터 복호화
 */
export const decrypt = (encryptedData: string): string => {
  try {
    const parts = encryptedData.split(':');
    if (parts.length < 2) {
      throw new Error('암호화된 데이터 형식이 잘못되었습니다 (IV 누락)');
    }
    const iv = Buffer.from(parts.shift() || '', 'hex');
    const encrypted = parts.join(':');

    // [수정 6] 'key' 변수는 scrypt로 생성된 동일한 32바이트 버퍼입니다.
    const decipher = createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('복호화 실패:', error);
    // (키가 다르거나, 데이터가 손상되었거나, 원본이 암호화되지 않았을 수 있습니다)
    return '복호화 실패';
  }
};

// --- (이하는 Cursor AI가 만든 유용한 헬퍼 함수들 - 그대로 사용) ---

/**
 * MedicalInfo 암호화 헬퍼
 */
export const encryptMedicalInfo = (data: {
  disabilityGrade?: string;
  medicalConditions?: string;
}) => {
  return {
    ...data,
    disabilityGrade: data.disabilityGrade
      ? encrypt(data.disabilityGrade)
      : undefined,
    medicalConditions: data.medicalConditions
      ? encrypt(data.medicalConditions)
      : undefined,
  };
};

/**
 * MedicalInfo 복호화 헬퍼
 */
export const decryptMedicalInfo = (data: {
  disabilityGrade?: string;
  medicalConditions?: string;
}) => {
  return {
    ...data,
    disabilityGrade: data.disabilityGrade
      ? decrypt(data.disabilityGrade)
      : undefined,
    medicalConditions: data.medicalConditions
      ? decrypt(data.medicalConditions)
      : undefined,
  };
};

