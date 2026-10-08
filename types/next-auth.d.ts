// 📍 경로: types/next-auth.d.ts — next-auth 세션·토큰 타입 확장
// (기존 '@/entities/User' import는 파일 삭제(7c4f9bd)로 깨져 role이 사실상 any였음 → 실제 역할 값으로 정의)

import { DefaultSession, DefaultUser } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

// DB에 실제로 저장되는 역할 값(users.role + 기기 계정 DEVICE_USER).
// lib/authOptions.ts APP_ROLES·middleware.ts KNOWN_ROLES 런타임 목록과 같게 유지할 것
export type AppRole =
  | 'GUEST'
  | 'NEW_USER'
  | 'PENDING'
  | 'REJECTED'
  | 'USER'
  | 'ADMIN'
  | 'MASTER'
  | 'DEVICE_USER';

// JWT 토큰(서버 암호화 쿠키)에 담는 필드
declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id?: string; // users.id 또는 device_auths.id (UUID)
    role?: AppRole;
    authSource?: 'users' | 'device_auths'; // 계정 출처(재확인할 테이블)
    mustChangePassword?: boolean; // 기기 계정 초기 비밀번호 변경 필요
    loginAt?: number; // 로그인 시각(ms) — 유휴 잠금 기록을 세션별로 구분
    accountCheckedAt?: number; // 계정 존재·역할을 DB에서 마지막으로 확인한 시각(ms)
    organization?: string | null;
    phoneNumber?: string | null;
    rejectionReason?: string | null;

    // 기기 사용자용
    wheelchairId?: string | null; // wheelchairs.id (UUID)
    deviceId?: string; // 기기 로그인 ID
  }
}

// useSession()·getServerSession()의 session.user
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: AppRole;
      mustChangePassword?: boolean;
      loginAt?: number;
      dbUserId?: number; // 세션 콜백이 채우지 않음(구 코드 참조용)
      organization?: string | null;
      phoneNumber?: string | null;
      kakaoId?: string;

      // 기기 사용자용
      wheelchairId?: string | null;
      wheelchairIdentifier?: string;
      deviceId?: string;
    } & DefaultSession['user']; // (기존 name, email, image 포함)
  }

  // authorize 콜백이 반환하는 'user' 객체
  interface User extends DefaultUser {
    role?: AppRole;
    wheelchairId?: string | null;
    wheelchairIdentifier?: string;
    deviceId?: string;
    mustChangePassword?: boolean;
    kakaoId?: string;
    organization?: string | null;
    phoneNumber?: string | null;
  }
}
