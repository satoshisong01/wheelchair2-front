// lib/password.ts — 비밀번호 강도 정책 (의료기기 사이버보안 요구사항 IA-05)

// 거부 시엔 어떤 규칙을 어겼는지 드러내지 않고 정책 전체를 한 문구로 안내한다 (RT uc_auth_06)
export const PASSWORD_POLICY_MESSAGE =
  '비밀번호는 영문·숫자·특수문자 3종 조합 시 8자 이상, 2종 조합 시 10자 이상이어야 합니다.';

// 기기 비밀번호 bcrypt 비용(등록·변경 공통). 기존 cost 10 해시도 compare가 해시 안의 cost를 읽어 그대로 검증된다
export const BCRYPT_COST = 12;

/**
 * 비밀번호 강도 검증. (KISA 패스워드 조합규칙 준용)
 * - 영문 / 숫자 / 특수문자 3종 조합: 8자 이상
 * - 2종 조합: 10자 이상
 */
export function validatePassword(pw: string): { ok: boolean; message?: string } {
  const rejected = { ok: false, message: PASSWORD_POLICY_MESSAGE };
  if (!pw || pw.length < 8) return rejected;
  const hasLetter = /[A-Za-z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  const categories = [hasLetter, hasDigit, hasSpecial].filter(Boolean).length;
  if (categories < 2) return rejected;
  if (categories === 2 && pw.length < 10) return rejected;
  return { ok: true };
}
