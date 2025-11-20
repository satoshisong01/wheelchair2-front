// 📍 경로: types/next-auth.d.ts (또는 프로젝트 루트)

import { UserRole } from '@/entities/User'; // ‼️ 저희가 만든 UserRole Enum 임포트
import NextAuth, { DefaultSession, DefaultUser } from 'next-auth';
import { JWT, DefaultJWT } from 'next-auth/jwt';

// ‼️ [수정] JWT 토큰에 추가될 필드 정의
declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string; // ‼️ [추가] Next-Auth의 기본 user.id (string)
    role: UserRole | 'DEVICE_USER'; // ‼️ 'DEVICE_USER' 또는 Enum
    dbUserId: number; // ‼️ [추가] 관리자 DB ID (number)
    organization?: string | null;
    phoneNumber?: string | null;
    kakaoId?: string;

    // 기기 사용자용
    wheelchairId?: number;
    wheelchairIdentifier?: string; // ‼️ [수정] nickname -> identifier
    deviceId?: string;
  }
}

// ‼️ [수정] useSession()의 session.user 객체에 추가될 필드 정의
declare module 'next-auth' {
  interface Session {
    user: {
      id: string; // ‼️ [추가] Next-Auth의 기본 user.id (string)
      role: UserRole | 'DEVICE_USER';
      dbUserId: number;
      organization?: string | null;
      phoneNumber?: string | null;
      kakaoId?: string;

      // 기기 사용자용
      wheelchairId?: number;
      wheelchairIdentifier?: string;
      deviceId?: string;
    } & DefaultSession['user']; // (기존 name, email, image 포함)
  }

  // ‼️ [수정] authorize 콜백이 반환하는 'user' 객체 타입
  interface User extends DefaultUser {
    // (id, name, email, image는 DefaultUser에 이미 string으로 있음)
    role?: UserRole | 'DEVICE_USER';
    wheelchairId?: number;
    wheelchairIdentifier?: string;
    deviceId?: string;
    kakaoId?: string;
    organization?: string | null;
    phoneNumber?: string | null;
    // ‼️ [삭제] hasMedicalInfo 제거
  }
}
