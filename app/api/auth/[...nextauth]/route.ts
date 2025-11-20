import NextAuth, {
  NextAuthOptions,
  Profile,
  User as NextAuthUser,
} from 'next-auth';
import KakaoProvider from 'next-auth/providers/kakao';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';
import { AppDataSource, connectDatabase } from '@/lib/db';
import { User, UserRole } from '@/entities/User';
import { DeviceAuth } from '@/entities/DeviceAuth';
import { AdminAuditLog, AdminAuditLogAction } from '@/entities/AdminAuditLog';

// --- 환경 변수 확인 ---
const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID;
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET;
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;

if (!KAKAO_CLIENT_ID || !KAKAO_CLIENT_SECRET || !NEXTAUTH_SECRET) {
  console.error(`❌ FATAL: .env.local 파일에 필수 인증 환경변수가 없습니다.`);
}

// Kakao 프로필 타입 확장
interface KakaoProfile extends Profile {
  properties?: { nickname: string };
  kakao_account?: {
    email: string;
    profile?: {
      nickname?: string;
      profile_image_url?: string;
    };
  };
}

export const authOptions: NextAuthOptions = {
  providers: [
    // [제공자 1] 기기 로그인
    CredentialsProvider({
      name: '기기 로그인',
      credentials: {
        deviceId: { label: '기기 ID', type: 'text' },
        password: { label: '비밀번호', type: 'password' },
      },
      async authorize(credentials): Promise<NextAuthUser | null> {
        if (!credentials?.deviceId || !credentials?.password) {
          throw new Error('기기 ID와 비밀번호를 입력하세요.');
        }
        try {
          await connectDatabase();
          const deviceAuth = await AppDataSource.getRepository(
            DeviceAuth
          ).findOne({
            where: { deviceId: credentials.deviceId },
            relations: { wheelchair: true },
          });

          if (!deviceAuth || !deviceAuth.password) {
            throw new Error('기기 ID 또는 비밀번호가 일치하지 않습니다.');
          }
          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            deviceAuth.password
          );
          if (!isPasswordValid) {
            throw new Error('기기 ID 또는 비밀번호가 일치하지 않습니다.');
          }
          if (!deviceAuth.wheelchair) {
            throw new Error('기기에 연결된 휠체어 정보가 없습니다.');
          }

          return {
            id: String(deviceAuth.id),
            role: 'DEVICE_USER',
            wheelchairId: deviceAuth.wheelchair.id,
            wheelchairIdentifier: deviceAuth.wheelchair.deviceSerial,
            deviceId: deviceAuth.deviceId,
          } as any;
        } catch (err) {
          console.error(`[DEBUG /api/auth] ‼️ 기기 로그인 에러`, err);
          throw new Error(err instanceof Error ? err.message : '인증 실패');
        }
      },
    }), // [제공자 2] 카카오 로그인

    KakaoProvider({
      clientId: KAKAO_CLIENT_ID!,
      clientSecret: KAKAO_CLIENT_SECRET!,
    }),
  ],

  session: { strategy: 'jwt' },

  events: {
    async signOut({ token }) {
      if (
        (token.role === 'ADMIN' || token.role === 'MASTER') &&
        token.dbUserId
      ) {
        try {
          await connectDatabase();
          const LogRepo = AppDataSource.getRepository(AdminAuditLog);
          await LogRepo.save({
            actionType: AdminAuditLogAction.LOGOUT,
            details: `관리자(ID: ${token.dbUserId}) 로그아웃`,
            adminUserId: token.dbUserId as number,
          });
        } catch (e) {
          console.error(`‼️ 감사 로그 저장 실패`, e);
        }
      }
    },
  },

  callbacks: {
    async signIn() {
      return true;
    }, // --- JWT 콜백 ---

    async jwt({ token, user, account, profile, trigger }) {
      // 1. 기기 로그인 처리
      if (trigger === 'signIn' && account?.provider === 'credentials' && user) {
        token.id = user.id;
        token.role = user.role as 'DEVICE_USER';
        const u = user as any;
        token.wheelchairId = u.wheelchairId;
        token.wheelchairIdentifier = u.wheelchairIdentifier;
        token.deviceId = u.deviceId;
      } // 2. 카카오 로그인 처리

      if (
        (trigger === 'signIn' || trigger === 'signUp') &&
        account?.provider === 'kakao'
      ) {
        try {
          await connectDatabase();
          const UserRepo = AppDataSource.getRepository(User);

          const kakaoProfile = profile as any; // 닉네임 추출 시도 (회원가입 시 임시 이름으로만 사용)
          const name =
            kakaoProfile?.kakao_account?.profile?.nickname ||
            kakaoProfile?.properties?.nickname ||
            user?.name ||
            'Unknown';

          const email = kakaoProfile?.kakao_account?.email || user?.email || '';
          const image =
            kakaoProfile?.kakao_account?.profile?.profile_image_url ||
            user?.image ||
            '';

          let dbUser = await UserRepo.findOne({
            where: { kakaoId: account.providerAccountId },
          });
          const isNewUser = !dbUser;

          if (dbUser) {
            // 기존 유저 업데이트
            // 🟢 [핵심 수정] DB에 저장된 닉네임은 회원가입 때 설정된 값이므로,
            // 카카오 프로필에서 가져온 name으로 덮어쓰지 않습니다.
            // if (name !== 'Unknown') dbUser.name = name; ⬅️ 이 로직을 제거
            if (email) dbUser.email = email;
            if (image) dbUser.image = image;
            await UserRepo.save(dbUser);
          } else {
            // 신규 유저 생성 (최초 로그인 시 임시 닉네임 설정)
            const newUser = UserRepo.create({
              kakaoId: account.providerAccountId,
              email,
              name,
              image,
              role: UserRole.PENDING,
            });
            dbUser = await UserRepo.save(newUser);
          } // 토큰 초기 세팅

          if (dbUser) {
            token.dbUserId = dbUser.id;
            token.role = dbUser.role;
            token.name = dbUser.name; // 로그인 로그

            if (trigger === 'signIn' && !isNewUser) {
              const LogRepo = AppDataSource.getRepository(AdminAuditLog);
              await LogRepo.save({
                actionType: AdminAuditLogAction.LOGIN,
                details: `관리자(${dbUser.name}) 로그인`,
                adminUserId: dbUser.id,
              });
            }
          }
        } catch (error) {
          console.error(`[DEBUG] 카카오 로그인 에러`, error);
        }
      }
      return token;
    }, // 🚨 [핵심 해결책] Session 콜백에서 DB 직접 조회 및 덮어쓰기

    async session({ session, token }) {
      // 기본 매핑
      session.user.id = token.id as string;
      session.user.role = token.role as UserRole | 'DEVICE_USER';
      session.user.dbUserId = token.dbUserId as number; // 기기 사용자

      if (token.role === 'DEVICE_USER') {
        session.user.wheelchairId = token.wheelchairId as number;
        session.user.wheelchairIdentifier =
          token.wheelchairIdentifier as string;
        session.user.deviceId = token.deviceId as string;
        session.user.name = token.deviceId as string;
      } // 관리자 (ADMIN/MASTER)
      else if (token.dbUserId) {
        // 🟢 여기서 DB를 조회해서 'Unknown'을 '운영진'으로 바꿔치기합니다.
        try {
          await connectDatabase();
          const UserRepo = AppDataSource.getRepository(User); // 토큰에 있는 dbUserId로 최신 유저 정보 조회
          const dbUser = await UserRepo.findOne({
            where: { id: Number(token.dbUserId) },
          });

          if (dbUser) {
            // DB에 있는 진짜 이름으로 덮어씌움
            session.user.name = dbUser.name;
            session.user.email = dbUser.email;
            session.user.organization = dbUser.organization;
            session.user.phoneNumber = dbUser.phoneNumber; // console.log(`[Session Sync] DB 이름 적용 완료: ${dbUser.name}`);
          } else {
            // DB 조회 실패 시 토큰 값 사용 (fallback)
            session.user.name = token.name;
            session.user.email = token.email;
          }
        } catch (e) {
          console.error('[Session Sync Error]', e); // 에러 시 토큰 값 사용
          session.user.name = token.name;
          session.user.email = token.email;
        }
      }

      return session;
    },
  },

  pages: {
    signIn: '/admin-portal',
    error: '/admin-portal',
    newUser: '/welcome',
  },
  secret: NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
