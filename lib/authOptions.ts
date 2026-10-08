//  lib/authOptions.ts — next-auth 설정 (기기 로그인 + 카카오 관리자 로그인, JWT 세션)

import type { NextAuthOptions, Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import KakaoProvider from 'next-auth/providers/kakao';
import CredentialsProvider from 'next-auth/providers/credentials';
import { query } from '@/lib/db';
import { createAuditLog } from '@/lib/log'; // createAuditLog 사용
import { logServerError } from '@/lib/server-log';
import bcrypt from 'bcrypt';
import { isLoginLocked, recordLoginFailure, resetLoginFailures } from '@/lib/login-lockout';
import type { AppRole } from '@/types/next-auth';

// 🔒 실제로 쓰는 역할 값만 허용 — 목록 밖 값(오염·미정의 역할)은 로그인·세션을 거부한다(fail-closed).
//    types/next-auth.d.ts AppRole·middleware.ts KNOWN_ROLES와 같게 유지
const APP_ROLES: readonly string[] = [
  'GUEST',
  'NEW_USER',
  'PENDING',
  'REJECTED',
  'USER',
  'ADMIN',
  'MASTER',
  'DEVICE_USER',
];
const isAppRole = (value: unknown): value is AppRole =>
  typeof value === 'string' && APP_ROLES.includes(value);

// 감사로그(lib/log.ts)가 저장하는 역할 — 그 외(GUEST 등)는 SYSTEM으로 남기고 실제 역할은 details에 적는다
const AUDIT_ROLES: readonly string[] = ['ADMIN', 'MASTER', 'DEVICE_USER'];
const auditRoleOf = (role: unknown): string =>
  typeof role === 'string' && AUDIT_ROLES.includes(role) ? role : 'SYSTEM';

// 🔒 [UC-03] 세션 최대 수명 12시간 — 사용자 활동이 있거나 안전 예외 화면(기기 사용자·관제)이면
//   IdleLogout이 5분 간격 getSession()으로 연장(슬라이딩)
const SESSION_MAX_AGE_SEC = 12 * 60 * 60;

// 계정 존재·역할·초기 비밀번호 플래그 재확인 간격 — 삭제·역할 변경이 최대 5분 안에 세션에 반영된다
const ACCOUNT_RECHECK_MS = 5 * 60 * 1000;
// 재확인 DB 조회 제한시간 — 넘으면 DB 오류와 같이 토큰을 유지(DB 지연·잠금 대기에 세션 조회가 묶여 화면이 멈추지 않게)
const ACCOUNT_RECHECK_TIMEOUT_MS = 2500;
// 재확인 결과 캐시(프로세스 메모리) — App Router route handler의 getServerSession은 쿠키를 다시 쓰지 못해
//   accountCheckedAt이 갱신되지 않으므로, 캐시가 없으면 5분이 지난 뒤로는 API 요청마다 DB를 다시 읽는다
const ACCOUNT_CACHE_TTL_MS = 5 * 60 * 1000;
const ACCOUNT_CACHE_MAX_ENTRIES = 1000;

// must_change_password 컬럼이 없는 DB(2026-10-08 마이그레이션 전)에서도 쿼리가 실패하지 않게 to_jsonb로 읽는다(없으면 false)
const DEVICE_MUST_CHANGE_COLUMN = `COALESCE((to_jsonb(d) ->> 'must_change_password')::boolean, false) AS must_change_password`;

// 등록 API와 같은 입력 길이 상한 — 비정상적으로 긴 값은 DB·Redis 조회 없이 거부
const MAX_DEVICE_ID_LENGTH = 100;
const MAX_PASSWORD_LENGTH = 200;

// 미등록 기기 ID도 bcrypt 비교를 거쳐 응답시간으로 ID 존재 여부를 추정하지 못하게 한다.
// 기존 기기 계정 해시가 cost 10이라 같은 비용으로 맞춤(최초 1회 생성 후 재사용)
let dummyHashPromise: Promise<string> | null = null;
const getDummyHash = (): Promise<string> => {
  if (!dummyHashPromise) dummyHashPromise = bcrypt.hash('device-login-timing-equalizer', 10);
  return dummyHashPromise;
};

// 카카오 프로필 값 정규화: 제어문자 제거·앞뒤 공백 제거·길이 제한
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanProfileText = (value: unknown, maxLength: number): string =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);

type KakaoProfile = {
  id?: unknown;
  kakao_account?: { email?: unknown; profile?: { nickname?: unknown } };
};

type DeviceAuthRow = { id: string; device_id: string; role: string | null };

// 기기 로그인 실패·잠금 감사기록 (등록된 기기만 — 미등록 ID는 공격자 입력일 수 있어 남기지 않음)
async function auditDeviceLoginFailure(device: DeviceAuthRow, locked: boolean): Promise<void> {
  const base = {
    userId: String(device.id),
    userRole: auditRoleOf(device.role || 'DEVICE_USER'),
    deviceSerial: device.device_id,
  };
  const details = { method: 'Device Credentials', deviceId: device.device_id };
  await createAuditLog({
    ...base,
    action: 'LOGIN_FAILED',
    details: { ...details, status: 'Failed', reason: 'BAD_PASSWORD' },
  });
  if (locked) {
    await createAuditLog({ ...base, action: 'ACCOUNT_LOCKED', details: { ...details, status: 'Locked' } });
  }
}

// 재확인할 계정 테이블 — authSource가 없는 구(이번 배포 이전) 세션은 기존 판정과 같게: DEVICE_USER면 기기 계정
const accountSourceOf = (token: JWT): 'users' | 'device_auths' =>
  token.authSource ?? (token.role === 'DEVICE_USER' ? 'device_auths' : 'users');

// 토큰의 계정을 DB에서 다시 읽은 값(클라이언트가 보낸 값은 쓰지 않음). 계정이 없거나 역할이 목록 밖이면 null
async function readAccountState(token: JWT): Promise<Partial<JWT> | null> {
  if (accountSourceOf(token) === 'device_auths') {
    const res = await query(
      `SELECT role, ${DEVICE_MUST_CHANGE_COLUMN} FROM device_auths d WHERE id = $1`,
      [token.id],
    );
    const row = res.rows[0];
    const role = row ? row.role || 'DEVICE_USER' : null;
    if (!row || !isAppRole(role)) return null;
    return { role, mustChangePassword: row.must_change_password === true };
  }
  const res = await query(
    `SELECT role, name, organization, phone_number, rejection_reason FROM users WHERE id = $1`,
    [token.id],
  );
  const row = res.rows[0];
  if (!row || !isAppRole(row.role)) return null;
  return {
    role: row.role,
    name: row.name,
    organization: row.organization,
    phoneNumber: row.phone_number,
    rejectionReason: row.rejection_reason,
    mustChangePassword: false,
  };
}

// 재확인 결과(state: null이면 삭제·무효 계정)와 DB에서 읽기 시작한 시각(ms)
type AccountCheck = { state: Partial<JWT> | null; at: number };
// 키: `${authSource}:${id}` — Map은 넣은 순서를 유지하므로 맨 앞이 가장 오래된 항목
const accountCheckCache = new Map<string, AccountCheck>();

function rememberAccountCheck(key: string, check: AccountCheck): void {
  const prev = accountCheckCache.get(key);
  if (prev && prev.at > check.at) return; // 더 나중에 시작한 조회 결과가 있으면 늦게 끝난 조회로 덮지 않음
  accountCheckCache.delete(key); // 다시 넣어 순서를 맨 뒤로
  accountCheckCache.set(key, check);
  while (accountCheckCache.size > ACCOUNT_CACHE_MAX_ENTRIES) {
    const oldest = accountCheckCache.keys().next().value;
    if (oldest === undefined) break;
    accountCheckCache.delete(oldest); // 가장 오래된 것부터 제거
  }
}

// 제한시간 안에 끝나지 않으면 오류로 끝낸다(조회 자체는 취소되지 않음 — 늦게 끝나면 결과만 캐시에 남는다)
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Account recheck timed out (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// 계정 재확인 — 캐시가 5분 안이면 DB를 읽지 않는다. force(update() 요청)는 캐시를 무시하고 바로 DB를 읽는다
async function checkAccount(token: JWT, force: boolean): Promise<AccountCheck> {
  const key = `${accountSourceOf(token)}:${token.id}`;
  const cached = accountCheckCache.get(key);
  if (!force && cached && Date.now() - cached.at < ACCOUNT_CACHE_TTL_MS) return cached;
  const startedAt = Date.now();
  const read = readAccountState(token).then((state) => {
    const check: AccountCheck = { state, at: startedAt };
    rememberAccountCheck(key, check);
    return check;
  });
  return withTimeout(read, ACCOUNT_RECHECK_TIMEOUT_MS);
}

// 로그인했지만 권한이 없는 API 요청 감사기록 (비로그인 요청은 남기지 않음 — 무차별 요청으로 감사로그가 넘치지 않게)
export async function auditAccessDenied(
  user: Session['user'] | undefined,
  target: string,
): Promise<void> {
  if (!user?.id) return;
  await createAuditLog({
    userId: user.id,
    userRole: auditRoleOf(user.role),
    action: 'ACCESS_DENIED',
    details: { status: 'Denied', target, role: user.role },
    deviceSerial: user.deviceId,
  });
}

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
        const deviceId = credentials?.deviceId;
        const password = credentials?.password;
        if (!deviceId || !password) return null;
        if (deviceId.length > MAX_DEVICE_ID_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
          return null;
        }
        // 🔒 [IA-07] 연속 로그인 실패 시 계정 잠금 (기기 단위)
        // 실패 사유는 서버 로그에 사유 코드로만 남기고, 화면엔 사유를 구분하지 않는 단일 문구(CredentialsSignin)만 보낸다
        const lockKey = `dev:${deviceId}`;
        try {
          if (await isLoginLocked(lockKey)) {
            console.warn('[device-login] 로그인 거부 (reason=LOCKED)');
            return null;
          }
          const result = await query(
            `SELECT id, password, wheelchair_id, device_id, role, ${DEVICE_MUST_CHANGE_COLUMN}
               FROM device_auths d WHERE device_id = $1`,
            [deviceId],
          );
          const device = result.rows[0];
          const isValid = await bcrypt.compare(
            password,
            device ? device.password : await getDummyHash(),
          );
          if (!device) {
            console.warn('[device-login] 로그인 실패 (reason=UNKNOWN_DEVICE)');
            return null;
          }
          if (!isValid) {
            const locked = await recordLoginFailure(lockKey); // 🔒 [IA-07] 실패 기록
            await auditDeviceLoginFailure(device, locked);
            console.warn('[device-login] 로그인 실패 (reason=BAD_PASSWORD)');
            return null;
          }

          // 🧪 [KTC 자체테스트] device_auths.role이 채워진 특수 계정(예: 관리자 테스트 계정)만
          //    해당 role을 쓰고, 일반 기기 계정(role=NULL)은 기존과 동일하게 DEVICE_USER 고정.
          const role = device.role || 'DEVICE_USER';
          if (!isAppRole(role)) {
            console.warn('[device-login] 로그인 거부 (reason=UNKNOWN_ROLE)');
            return null;
          }
          await resetLoginFailures(lockKey); // 🔒 [IA-07] 성공 시 실패 카운트 초기화

          const userPayload = {
            id: String(device.id),
            role,
            wheelchairId: device.wheelchair_id,
            deviceId: device.device_id,
            name: `Device-${device.device_id}`,
            // 🔒 [uc_auth_04] 초기 비밀번호 변경 전이면 middleware가 /mypage 외 접근을 막는다
            mustChangePassword: device.must_change_password === true,
          };

          // ⭐️ 기기 로그인 성공 시 감사 로그 기록
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

          return userPayload;
        } catch (error) {
          logServerError('Device login error', error);
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
    maxAge: SESSION_MAX_AGE_SEC, // 12시간 (활동 시 연장)
  },
  events: {
    // ⭐️ 로그아웃 이벤트 감사 로그 (DEVICE_USER 포함)
    async signOut({ token }) {
      const role = token?.role;
      if (role === 'ADMIN' || role === 'MASTER' || role === 'DEVICE_USER') {
        try {
          await createAuditLog({
            userId: token.id,
            userRole: role,
            action: 'LOGOUT',
            details: { status: 'Success', method: 'NextAuth Event', deviceId: token.deviceId },
            deviceSerial: token.deviceId, // 기기 로그의 경우 deviceSerial에 deviceId를 저장
          });
        } catch (e) {
          logServerError('Logout log error', e);
        }
      }
    },
  },

  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === 'kakao') {
        const kakaoProfile = profile as KakaoProfile | undefined;
        const kakaoId = String(kakaoProfile?.id);
        const name = cleanProfileText(kakaoProfile?.kakao_account?.profile?.nickname, 100);
        const rawEmail = cleanProfileText(kakaoProfile?.kakao_account?.email, 254);
        const email = EMAIL_PATTERN.test(rawEmail) ? rawEmail : ''; // 형식이 아니면 빈 값
        try {
          const userRes = await query(`SELECT id, role FROM users WHERE kakao_id = $1`, [kakaoId]);
          if (userRes.rowCount === 0) {
            // 신규 GUEST 가입
            const inserted = await query(
              `INSERT INTO users (kakao_id, email, name, role, created_at) VALUES ($1, $2, $3, 'GUEST', NOW()) RETURNING id`,
              [kakaoId, email, name],
            );
            // 가입(GUEST 생성) 기록 — GUEST는 감사로그 저장 역할이 아니어서 SYSTEM으로 남김
            await createAuditLog({
              userId: String(inserted.rows[0].id),
              userRole: 'SYSTEM',
              action: 'USER_SIGNUP',
              details: { status: 'Success', method: 'kakao', newRole: 'GUEST' },
            });
          }
          return true;
        } catch (error) {
          logServerError('Kakao sign-in DB error', error);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, account, profile, trigger }) {
      // [A] 최초 로그인 처리: user 객체가 존재할 때 (로그인 성공)
      if (user) {
        let userIdFromDB: string | undefined = undefined;
        let userRoleFromDB: unknown = undefined;
        let userNameFromDB: string | undefined = undefined;

        // 1. 카카오 유저: DB에서 UUID와 Role, Name을 다시 조회
        if (account?.provider === 'kakao') {
          const kakaoId = String((profile as KakaoProfile | undefined)?.id);
          const dbRes = await query(`SELECT id, role, name FROM users WHERE kakao_id = $1`, [kakaoId]);
          if (dbRes.rows.length === 0) {
            console.error('FATAL: Failed to retrieve user UUID after Kakao sign-in.');
            return null;
          }
          userIdFromDB = dbRes.rows[0].id;
          userRoleFromDB = dbRes.rows[0].role;
          userNameFromDB = dbRes.rows[0].name;
        } else {
          // 2. 기기 로그인: user 객체에 이미 UUID와 Role, Name이 포함됨
          userIdFromDB = user.id;
          userRoleFromDB = user.role;
          userNameFromDB = user.name ?? undefined;
        }

        // 🔒 목록 밖 역할은 로그인 거부 (fail-closed)
        if (!isAppRole(userRoleFromDB)) {
          console.warn('[auth] 허용되지 않은 역할 값 — 로그인 거부');
          return null;
        }

        // 🧪 [KTC 자체테스트] 아래 [B] 재확인이 조회할 테이블을 구분하기 위한 출처 기록.
        //    device_auths 계정은 role=ADMIN이어도(테스트계정) users 테이블엔 없으므로 role만으로 판단하면 안 됨.
        const authSource = account?.provider === 'kakao' ? 'users' : 'device_auths';
        const now = Date.now();

        // 토큰에 필수 정보 저장
        token.id = userIdFromDB;
        token.role = userRoleFromDB;
        token.name = userNameFromDB;
        token.wheelchairId = user.wheelchairId;
        token.deviceId = user.deviceId;
        token.authSource = authSource;
        token.mustChangePassword = authSource === 'device_auths' && user.mustChangePassword === true;
        token.loginAt = now; // 유휴 잠금 기록을 로그인(세션)별로 구분
        token.accountCheckedAt = now; // 방금 DB에서 읽었으므로 [B] 재확인은 5분 뒤부터

        // ⭐️ 관리자(카카오) 로그인 감사 로그 — 기기 계정(테스트용 ADMIN 포함)은 authorize에서 이미 기록
        if (authSource === 'users' && (token.role === 'ADMIN' || token.role === 'MASTER')) {
          await createAuditLog({
            userId: token.id,
            userRole: token.role,
            action: 'LOGIN',
            details: {
              status: 'Success',
              method: account?.provider || 'Credentials',
            },
          });
        }
      }

      // [B] 계정 존재·역할 재확인 — 5분 간격, update() 요청 시엔 즉시
      //     (계정 삭제·역할 변경·초기 비밀번호 변경 완료가 세션에 반영되도록. KTC 관리자 테스트 계정은 authSource로 device_auths 조회)
      //     결과는 계정별로 5분 캐시(route handler가 요청마다 DB를 읽지 않게), DB 조회는 2.5초 제한
      if (token.id) {
        const isDue =
          trigger === 'update' ||
          typeof token.accountCheckedAt !== 'number' ||
          Date.now() - token.accountCheckedAt >= ACCOUNT_RECHECK_MS;
        if (isDue) {
          try {
            const { state: fresh, at: checkedAt } = await checkAccount(token, trigger === 'update');
            if (!fresh) {
              console.warn('[auth] 삭제되었거나 역할이 유효하지 않은 계정의 세션 — 무효화');
              return null;
            }
            // 초기 비밀번호 강제 변경은 로그인 시점(authorize)에만 건다 — 쓰던 세션을 도중에 막으면 휠체어 사용자가
            //   보던 알람 화면이 갑자기 비밀번호 화면으로 바뀌므로, 재확인에서는 해제(변경 완료 반영)만 받아들인다
            const mustChangePassword = token.mustChangePassword === true && fresh.mustChangePassword;
            // 확인 시각은 DB에서 읽은 시각(캐시 값이면 그 시각) — 캐시를 거쳐도 반영 지연이 5분을 넘지 않게
            Object.assign(token, fresh, { mustChangePassword, accountCheckedAt: checkedAt });
          } catch (e) {
            // DB 장애·제한시간 초과 시엔 기존 토큰을 유지(가용성 우선) — 다음 요청에서 다시 확인
            logServerError('Session validation error', e);
          }
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
        let params: unknown[] = [];
        if (profile) {
          const kakaoId = String((profile as KakaoProfile).id);
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
            logServerError('JWT DB fetch error', e);
          }
        }
      }

      return token;
    },
    // 3. 세션 생성
    async session({ session, token }) {
      // jwt 콜백이 null(삭제·무효 계정)을 돌려주면 token이 없음 → 예외를 던져 next-auth가 세션 쿠키를 지우게 한다
      if (!token) throw new Error('Invalidated session');
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.name = token.name;
        session.user.wheelchairId = token.wheelchairId;
        session.user.deviceId = token.deviceId;
        session.user.mustChangePassword = token.mustChangePassword === true;
        session.user.loginAt = token.loginAt;
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
