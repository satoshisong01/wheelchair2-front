//  lib/authOptions.ts (수정된 전체 코드)

import { NextAuthOptions } from 'next-auth';
import KakaoProvider from 'next-auth/providers/kakao';
import CredentialsProvider from 'next-auth/providers/credentials';
import { query } from '@/lib/db';
import { createAuditLog } from '@/lib/log'; // createAuditLog 사용
import bcrypt from 'bcrypt';
export const authOptions: NextAuthOptions = {
  providers: [
    // ------------------------------------------------------
    // 1. 기기 로그인 (Credentials Provider)
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
          // 쿼리 문자열 정리 (이전 단계에서 해결됨)
          const sql = `SELECT id, password, wheelchair_id, device_id FROM device_auths WHERE device_id = $1`;
          const result = await query(sql, [credentials.deviceId]);
          const device = result.rows[0];
          if (!device) throw new Error('등록되지 않은 기기입니다.');
          const isValid = await bcrypt.compare(credentials.password, device.password);
          if (!isValid) throw new Error('비밀번호가 일치하지 않습니다.');

          const userPayload = {
            id: String(device.id),
            role: 'DEVICE_USER',
            wheelchairId: device.wheelchair_id,
            deviceId: device.device_id,
            name: `Device-${device.device_id}`,
          };

          // ⭐️ [핵심 수정 1] 기기 로그인 성공 시 감사 로그 기록
          try {
            await createAuditLog({
              userId: userPayload.id,
              userRole: userPayload.role,
              action: 'LOGIN',
              details: {
                status: 'Success',
                deviceId: userPayload.deviceId,
                method: 'Device Credentials',
              },
              deviceSerial: userPayload.deviceId,
            });
          } catch (e) {
            console.error('Device Login audit log error:', e);
          }

          return userPayload as any;
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
    maxAge: 5 * 24 * 60 * 60, // 5일
  },
  events: {
    // ⭐️ [핵심 수정 2] 로그아웃 이벤트에 DEVICE_USER 로그 추가
    async signOut({ token }) {
      // @ts-ignore
      const role = token?.role;
      // @ts-ignore
      const userId = token?.id;
      // @ts-ignore
      const deviceId = token?.deviceId;

      if (role === 'ADMIN' || role === 'MASTER' || role === 'DEVICE_USER') {
        // ⭐️ DEVICE_USER 추가
        try {
          await createAuditLog({
            userId: userId,
            userRole: role,
            action: 'LOGOUT',
            details: { status: 'Success', method: 'NextAuth Event', deviceId: deviceId },
            deviceSerial: deviceId, // 기기 로그의 경우 deviceSerial에 deviceId를 저장
          });
        } catch (e) {
          console.error('Logout log error:', e);
        }
      }
    },
  },

  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'kakao') {
        const kakaoId = String((profile as any).id);
        const email = (profile as any).kakao_account?.email || '';
        const name = (profile as any).kakao_account?.profile?.nickname || '';
        try {
          const userRes = await query(`SELECT id, role FROM users WHERE kakao_id = $1`, [kakaoId]);
          if (userRes.rowCount > 0) {
            // 기존 사용자
          } else {
            // 신규 GUEST 가입
            await query(
              `INSERT INTO users (kakao_id, email, name, role, created_at) VALUES ($1, $2, $3, 'GUEST', NOW())`,
              [kakaoId, email, name],
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
    async jwt({ token, user, account, profile, trigger, session }) {
      let userIdFromDB: string | undefined = undefined;
      let userRoleFromDB: string | undefined = undefined;
      let userNameFromDB: string | undefined = undefined;

      // [A] 최초 로그인 처리: user 객체가 존재할 때 (로그인 성공)
      if (user) {
        // 1. 카카오 유저: DB에서 UUID와 Role, Name을 다시 조회
        if (account?.provider === 'kakao') {
          const kakaoId = String((profile as any)?.id);
          const dbRes = await query(`SELECT id, role, name, email FROM users WHERE kakao_id = $1`, [
            kakaoId,
          ]);
          if (dbRes.rows.length > 0) {
            userIdFromDB = dbRes.rows[0].id;
            userRoleFromDB = dbRes.rows[0].role;
            userNameFromDB = dbRes.rows[0].name;
          } else {
            console.error('FATAL: Failed to retrieve user UUID after Kakao sign-in.');
            return null;
          }
        } else {
          // 2. 기기 로그인: user 객체에 이미 UUID와 Role, Name이 포함됨
          userIdFromDB = user.id;
          userRoleFromDB = (user as any).role;
          userNameFromDB = (user as any).name;
        }

        // 토큰에 필수 정보 저장
        token.id = userIdFromDB;
        token.role = userRoleFromDB;
        token.name = userNameFromDB;
        token.wheelchairId = (user as any).wheelchairId;
        token.deviceId = (user as any).deviceId;

        // ⭐️ [핵심 수정 3] 관리자 로그인 성공 시 감사 로그 기록 (기기 로그인은 authorize에서 처리)
        if (token.role === 'ADMIN' || token.role === 'MASTER') {
          try {
            await createAuditLog({
              userId: token.id as string,
              userRole: token.role as string,
              action: 'LOGIN',
              details: {
                status: 'Success',
                method: account?.provider || 'Credentials',
              },
            });
            console.log(`✅ [Audit Log] LOGIN recorded for user ${token.id} (${token.role})`);
          } catch (e) {
            console.error('Login audit log error:', e);
          }
        }
      }

      // [B] 세션 유효성 검사 및 갱신 (기존 로직 유지, token.id는 UUID)
      if (token.id) {
        // 1. 기기 사용자가 아닌 경우 (카카오 유저 확인)
        if (token.role !== 'DEVICE_USER') {
          try {
            // DB에 해당 ID가 존재하는지 가볍게 확인 (UUID 사용)
            const exists = await query(`SELECT 1 FROM users WHERE id = $1`, [token.id]);

            if (exists.rowCount === 0) {
              console.log(
                `💀 [Zombie Session Detected] User ${token.id} not found in DB. Invalidating token.`,
              );
              return null;
            }
          } catch (e) {
            console.error('Session validation error:', e);
          }
        }
      }

      // [C] 세션 업데이트 요청 (update() 호출 시 실행)
      if (trigger === 'update') {
        try {
          const userId = token.id;
          if (!userId) {
            console.error('❌ [NextAuth] 업데이트 실패: 사용자 ID(UUID)가 토큰에 없습니다.');
            return token;
          }
          // DB에서 최신 정보를 다시 조회
          const sql = `SELECT role, name, organization, phone_number, rejection_reason FROM users WHERE id = $1`;
          const result = await query(sql, [userId]);
          if (result.rows.length > 0) {
            const freshUser = result.rows[0];
            token.role = freshUser.role;
            token.name = freshUser.name;
            token.organization = freshUser.organization;
            token.phoneNumber = freshUser.phone_number;
            token.rejectionReason = freshUser.rejection_reason;
            console.log(`✅ [NextAuth] 토큰 갱신 성공: ${token.role} (UUID: ${userId})`);
          }
        } catch (e) {
          console.error('❌ [NextAuth] 토큰 갱신 중 DB 에러:', e);
        }
      }

      // [D] 카카오 유저 DB 동기화 (기존 로직 유지)
      if (
        (account?.provider === 'kakao' || token.email) &&
        !token.wheelchairId &&
        trigger !== 'update' &&
        !token.role // Role이 이미 설정되어 있다면 재동기화 생략
      ) {
        let sql = '';
        let params: any[] = [];
        if (profile) {
          const kakaoId = String((profile as any).id);
          sql = `SELECT id, role, organization, phone_number, name, email, rejection_reason FROM users WHERE kakao_id = $1`;
          params = [kakaoId];
        } else if (token.email) {
          sql = `SELECT id, role, organization, phone_number, name, email, rejection_reason FROM users WHERE email = $1`;
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
              // ... (나머지 토큰 정보 동기화 유지) ...
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
        (session.user as any).name = token.name;
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
