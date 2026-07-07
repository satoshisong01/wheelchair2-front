// lib/password.ts — 비밀번호 강도 정책 (의료기기 사이버보안 요구사항 IA-05)

export const PASSWORD_POLICY_MESSAGE =
  '비밀번호는 영문·숫자·특수문자 3종 조합 시 8자 이상, 2종 조합 시 10자 이상이어야 합니다.';

/**
 * 비밀번호 강도 검증. (KISA 패스워드 조합규칙 준용)
 * - 영문 / 숫자 / 특수문자 3종 조합: 8자 이상
 * - 2종 조합: 10자 이상
 */
export function validatePassword(pw: string): { ok: boolean; message?: string } {
  if (!pw || pw.length < 8) {
    return { ok: false, message: '비밀번호는 8자 이상이어야 합니다.' };
  }
  const hasLetter = /[A-Za-z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  const categories = [hasLetter, hasDigit, hasSpecial].filter(Boolean).length;
  if (categories < 2) {
    return {
      ok: false,
      message: '비밀번호는 영문·숫자·특수문자 중 2종 이상을 포함해야 합니다.',
    };
  }
  if (categories === 2 && pw.length < 10) {
    return {
      ok: false,
      message: '2종 조합 비밀번호는 10자 이상이어야 합니다. (3종 조합 시 8자 이상)',
    };
  }
  return { ok: true };
}
