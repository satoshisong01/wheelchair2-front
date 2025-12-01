import { NextAuthOptions } from 'next-auth';
import KakaoProvider from 'next-auth/providers/kakao';
import CredentialsProvider from 'next-auth/providers/credentials';
import { query } from '@/lib/db';
import { createAuditLog } from '@/lib/log';
import bcrypt from 'bcrypt';

export const authOptions: NextAuthOptions = {
  providers: [
    // ------------------------------------------------------
    // 1. 기기 로그인 (Credentials Provider) - [FIX] 컬럼명 수정
    // ------------------------------------------------------
    CredentialsProvider({
      id: 'device-login',
      name: 'Device Login',
      credentials: {
        deviceId: { label: 'Device ID', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.deviceId || !credentials?.password) return null;

        try {
          // ⭐️ [FIX] DB 컬럼명 수정 (wheelchairId -> wheelchair_id, deviceId -> device_id)
          // PostgreSQL은 보통 snake_case를 사용합니다.
          const sql = `
                        SELECT id, password, wheelchair_id, device_id
                        FROM device_auths
                        WHERE device_id = $1
                    `;
          const result = await query(sql, [credentials.deviceId]);
          const device = result.rows[0];

          if (!device) throw new Error('등록되지 않은 기기입니다.');

          // 비밀번호 검증
          const isValid = await bcrypt.compare(
            credentials.password,
            device.password
          );
          if (!isValid) throw new Error('비밀번호가 일치하지 않습니다.');

          // 로그인 성공! 세션 객체 생성
          // ⭐️ DB의 snake_case 데이터를 camelCase로 변환해서 넘겨줍니다.
          return {
            id: String(device.id),
            role: 'DEVICE_USER',
            wheelchairId: device.wheelchair_id, // DB 컬럼(wheelchair_id) -> 세션 속성(wheelchairId)
            deviceId: device.device_id, // DB 컬럼(device_id) -> 세션 속성(deviceId)
            name: `Device-${device.device_id}`,
          } as any;
        } catch (error) {
          console.error('Device login error:', error);
          return null;
        }
      },
    }),

    // ------------------------------------------------------
    // 2. 관리자 로그인 (Kakao Provider)
    // ------------------------------------------------------
    KakaoProvider({
      clientId: process.env.KAKAO_CLIENT_ID || '',
      clientSecret: process.env.KAKAO_CLIENT_SECRET || '',
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30일
  },

  events: {
    async signOut({ token }) {
      // @ts-ignore
      const role = token?.role;
      // @ts-ignore
      const userId = token?.id;

      if (role === 'ADMIN' || role === 'MASTER') {
        try {
          await createAuditLog({
            userId: userId,
            userRole: role,
            action: 'LOGOUT',
            details: { status: 'Success', method: 'NextAuth Event' },
          });
        } catch (e) {
          console.error('Logout log error:', e);
        }
      }
    },
  },

  callbacks: {
    // 1. 카카오 로그인 직후
    async signIn({ user, account, profile }) {
      if (account?.provider === 'kakao') {
        const kakaoId = String((profile as any).id);
        const email = (profile as any).kakao_account?.email || '';
        const name = (profile as any).kakao_account?.profile?.nickname || '';

        try {
          const userRes = await query(
            `
                        SELECT id, role FROM users WHERE kakao_id = $1
                    `,
            [kakaoId]
          );

          if (userRes.rowCount > 0) {
            // [기존] 로그인 시간 업데이트 (컬럼 존재 시)
            // await query(`UPDATE users SET last_login_at = NOW() WHERE kakao_id = $1`, [kakaoId]);
          } else {
            // [신규] GUEST 가입
            await query(
              `
                            INSERT INTO users (kakao_id, email, name, role, created_at)
                            VALUES ($1, $2, $3, 'GUEST', NOW())
                        `,
              [kakaoId, email, name]
            );
          }
          return true;
        } catch (error) {
          console.error('Kakao sign-in DB error:', error);
          return false;
        }
      }
      return true;
    },

    // 2. JWT 토큰 생성
    async jwt({ token, user, account, profile }) {
      // [A] 최초 로그인 (기기 로그인 포함)
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.wheelchairId = (user as any).wheelchairId; // 기기 로그인 시 저장됨
        token.deviceId = (user as any).deviceId; // 기기 ID 저장
      }

      // [B] 카카오 유저 DB 동기화 (기기 로그인은 pass)
      // wheelchairId가 없다는 건 관리자/유저라는 뜻이므로 DB 조회
      if (
        (account?.provider === 'kakao' || token.email) &&
        !token.wheelchairId
      ) {
        let sql = '';
        let params: any[] = [];

        if (profile) {
          const kakaoId = String((profile as any).id);
          sql = `SELECT id, role, organization, phone_number, name, email FROM users WHERE kakao_id = $1`;
          params = [kakaoId];
        } else if (token.email) {
          sql = `SELECT id, role, organization, phone_number, name, email FROM users WHERE email = $1`;
          params = [token.email];
        }

        if (sql) {
          try {
            const dbUserRes = await query(sql, params);
            const dbUser = dbUserRes.rows[0];

            if (dbUser) {
              token.id = dbUser.id;
              token.role = dbUser.role;
              token.name = dbUser.name;
              token.email = dbUser.email;
              token.organization = dbUser.organization;
              token.phoneNumber = dbUser.phone_number;
            }
          } catch (e) {
            console.error('JWT DB fetch error:', e);
          }
        }
      }
      return token;
    },

    // 3. 세션 생성
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = token.role as string;
        (session.user as any).name = token.name as string;
        (session.user as any).email = token.email as string;
        (session.user as any).organization = token.organization as string;
        (session.user as any).phoneNumber = token.phoneNumber as string;

        // 기기 정보 주입
        (session.user as any).wheelchairId = token.wheelchairId;
        (session.user as any).deviceId = token.deviceId;
      }
      return session;
    },
  },

  pages: {
    signIn: '/',
    error: '/',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
