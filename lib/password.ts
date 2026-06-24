// lib/password.ts — 비밀번호 강도 정책 (의료기기 사이버보안 요구사항 IA-05)

export const PASSWORD_POLICY_MESSAGE =
  '비밀번호는 8자 이상이며, 영문·숫자·특수문자 중 2종 이상을 포함해야 합니다.';

/**
 * 비밀번호 강도 검증.
 * - 최소 8자 이상
 * - 영문 / 숫자 / 특수문자 중 2종 이상 포함
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
  return { ok: true };
}
