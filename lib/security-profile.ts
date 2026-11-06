// lib/security-profile.ts — 사용자·관리자가 직접 체감하는 보안 통제 설정값
// - 초기 비밀번호 강제 변경(uc_auth_04), 유휴 30분 자동 로그아웃(UC-03), 로그인 유지 12시간
// - 유휴 시간의 시험용 빌드 환경변수(NEXT_PUBLIC_IDLE_LOGOUT_MINUTES)는 잠금 시간을 줄이는 쪽으로만 쓰인다(끄거나 늘리지 못함)
// - 서버(authOptions·middleware)와 클라이언트(IdleLogout)가 함께 읽으므로 상수만 둔다(서버 전용 모듈 import 금지)

type SecurityProfile = {
  readonly forceInitialPasswordChange: boolean; // 기기 계정의 초기 비밀번호 표시(must_change_password)를 적용할지
  readonly idleLogoutMinutes: number; // 유휴 자동 로그아웃 시간(분)
  readonly sessionMaxAgeSec: number; // 로그인 유지 시간(JWT 세션 최대 수명, 초 — 활동 시 연장)
};

export const SECURITY_PROFILE: SecurityProfile = {
  forceInitialPasswordChange: true,
  idleLogoutMinutes: 30,
  sessionMaxAgeSec: 12 * 60 * 60, // 12시간
};
