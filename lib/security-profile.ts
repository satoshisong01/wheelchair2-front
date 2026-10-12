// lib/security-profile.ts — 보안 프로필: 사용자·관리자가 직접 체감하는 보안 통제 3가지만 운영본/심사본으로 나눈다
// - standard: 운영 서비스(main 브랜치) — 기존 방식 유지. 초기 비밀번호 강제 변경 끔, 유휴 자동 로그아웃 끔, 로그인 유지 30일
// - strict  : 식약처 등 심사·평가 제출본(cert/mfds 브랜치) — 초기 비밀번호 강제 변경(uc_auth_04), 유휴 30분 자동 로그아웃(UC-03),
//             로그인 유지 12시간
// - 심사본 브랜치는 main에서 만들고 아래 ACTIVE_PROFILE 한 줄만 'strict'로 바꾼다(main과의 차이는 이 한 줄뿐 —
//   그 브랜치의 Vercel 자동 배포 끔(vercel.json)과 제출 아카이브 제외 목록(.gitattributes)도 main에 함께 둔다)
// - 프로필을 환경변수로 고르는 기능은 일부러 두지 않는다(배포 설정만으로 프로필이 바뀌지 않게). 유휴 시간의 시험용
//   빌드 환경변수(NEXT_PUBLIC_IDLE_LOGOUT_MINUTES)는 잠금을 켜거나 줄이는 쪽으로만 쓰인다(strict 잠금을 끄거나 늘리지 못함)
// - 입력 검증·감사로그·TLS·역할 재확인·요청 제한 등 보이지 않는 보안 강화는 프로필과 상관없이 항상 적용된다
// - 서버(authOptions·middleware)와 클라이언트(IdleLogout)가 함께 읽으므로 상수만 둔다(서버 전용 모듈 import 금지)

type SecurityProfileName = 'standard' | 'strict';

type SecurityProfile = {
  readonly forceInitialPasswordChange: boolean; // 기기 계정의 초기 비밀번호 표시(must_change_password)를 적용할지
  readonly idleLogoutMinutes: number; // 유휴 자동 로그아웃 시간(분, 0 = 끔)
  readonly sessionMaxAgeSec: number; // 로그인 유지 시간(JWT 세션 최대 수명, 초 — 활동 시 연장)
};

const PROFILES: Record<SecurityProfileName, SecurityProfile> = {
  standard: {
    forceInitialPasswordChange: false,
    idleLogoutMinutes: 0,
    sessionMaxAgeSec: 30 * 24 * 60 * 60, // 30일
  },
  strict: {
    forceInitialPasswordChange: true,
    idleLogoutMinutes: 30,
    sessionMaxAgeSec: 12 * 60 * 60, // 12시간
  },
};

// 🔒 적용 프로필 — main(운영) = 'standard', 심사본 브랜치(cert/mfds) = 'strict'
const ACTIVE_PROFILE: SecurityProfileName = 'strict';

export const SECURITY_PROFILE: SecurityProfile = PROFILES[ACTIVE_PROFILE];
