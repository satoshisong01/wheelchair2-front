'use client';

// components/common/IdleLogout.tsx — 유휴 세션 자동 잠금/로그아웃 (의료기기 사이버보안 요구사항 UC-03, RT uc_auth_12)
// - 사용자 입력이 NEXT_PUBLIC_IDLE_LOGOUT_MINUTES(기본 30분, 0이면 끔) 동안 없으면 로그아웃 → '/'(기기 로그인 화면)
// - 앱(WebView)에 LOGOUT/SESSION_EXPIRED 메시지를 보내지 않는다 → 앱의 FCM 응급 푸시 구독이 유지된다
//   (앱은 이 두 메시지를 받을 때만 구독을 해지함)
// - 마지막 활동 시각을 localStorage에 남겨, 앱을 닫았다 다시 열거나 다른 탭에서 봐도 한도가 지났으면 바로 잠근다
//   (한도 안이면 화면 열기(마운트·화면 이동)도 활동으로 기록)
// - 활동이 있으면 5분 간격으로 getSession()을 불러 서버 세션(JWT 12시간) 만료를 연장한다(활동 없는 일반 화면은 연장 안 됨)
// - 안전 예외(IDLE_LOCK_EXEMPT) 화면은 잠그지 않고, 입력과 무관하게 5분 간격으로 세션을 연장한다

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getSession, signOut, useSession } from 'next-auth/react';

const DEFAULT_IDLE_MINUTES = 30;
// 빌드 시점 값(NEXT_PUBLIC_)이라 바꾸면 다시 빌드해야 함. 비어 있으면 기본값(빈 값이 0=끔으로 읽히지 않게)
const rawIdleMinutes = process.env.NEXT_PUBLIC_IDLE_LOGOUT_MINUTES?.trim();
const configuredMinutes = rawIdleMinutes ? Number(rawIdleMinutes) : DEFAULT_IDLE_MINUTES;
const IDLE_LIMIT_MS =
  (Number.isFinite(configuredMinutes) && configuredMinutes >= 0 ? configuredMinutes : DEFAULT_IDLE_MINUTES) *
  60 *
  1000; // 0 = 자동 잠금 끔

const STORAGE_KEY = 'idle-logout:last-activity';
const STORAGE_WRITE_INTERVAL_MS = 15 * 1000; // 활동 기록 쓰기 간격(빈번한 저장 방지)
const SESSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 서버 세션 연장 간격
const IDLE_CHECK_INTERVAL_MS = 15 * 1000; // 유휴 확인 간격(예외 화면은 활동 기록 갱신 간격)
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

// 🩺 유휴 잠금 안전 예외 — 의료기기 사이버보안: 보안 통제가 필수 안전 기능(알람 관제)을 방해하지 않도록(업체 회신 근거).
//    잠그면 '/'로 이동하면서 화면의 실시간 알람(소켓·알람음·팝업)이 끊긴다. 예외 범위는 아래 roles·paths 줄만 고치면 된다
const IDLE_LOCK_EXEMPT: { roles: readonly string[]; paths: readonly string[] } = {
  roles: ['DEVICE_USER'], // 이 역할은 모든 화면에서 잠그지 않음(기기 사용자 모바일 화면)
  paths: ['/dashboard', '/wheelchair-info'], // 이 화면(하위 경로 포함)은 잠그지 않음(관리자 실시간 관제)
};

// '/dashboard'와 '/dashboard/...'는 예외, '/dashboard2'는 아님(middleware matchesPath와 같은 기준)
const isIdleLockExempt = (role: string | undefined, pathname: string): boolean =>
  (role !== undefined && IDLE_LOCK_EXEMPT.roles.includes(role)) ||
  IDLE_LOCK_EXEMPT.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

// session: 로그인 세션 구분값, at: 마지막 활동 시각(ms), locked: 다른 탭에서 잠금이 일어났음
type ActivityRecord = { session: string; at: number; locked?: boolean };

function readActivity(): ActivityRecord | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as Partial<ActivityRecord> | null;
    return typeof record?.session === 'string' && typeof record?.at === 'number'
      ? { session: record.session, at: record.at, locked: record.locked === true }
      : null;
  } catch {
    return null; // 저장소 사용 불가(사생활 보호 모드 등)·손상된 값 → 기록 없음으로 취급
  }
}

function writeActivity(record: ActivityRecord): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* 저장소 사용 불가 — 이 탭의 메모리 기록으로만 판단 */
  }
}

export default function IdleLogout() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  // 세션 구분값: 새로 로그인하면 바뀌어, 이전 세션의 오래된 활동 기록 때문에 바로 잠기지 않게 한다
  const sessionKey = `${session?.user?.id ?? ''}:${session?.user?.loginAt ?? ''}`;
  const exempt = isIdleLockExempt(session?.user?.role, pathname);
  // 마지막 서버 세션 연장 시각 — 화면 이동으로 effect가 다시 돌아도 연장 주기가 처음부터 다시 시작되지 않게 유지
  const lastRefreshRef = useRef(0);

  // 보호 화면에서 세션이 사라지면(예: 앱이 12시간 넘게 백그라운드에서 멈춰 있다가 돌아옴) 첫 화면으로 보냄
  //   — 그대로 두면 실시간 연결이 끊긴 화면이 방치되어 사용자가 끊김을 모름.
  //   '/'는 앱에 구독 해지 신호를 보내지 않으므로 FCM 안전 알림은 유지되고, 로그인이 살아 있으면 미들웨어가 다시 홈으로 보냄
  useEffect(() => {
    if (status === 'unauthenticated') window.location.replace('/');
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const openedAt = Date.now();
    if (lastRefreshRef.current === 0) lastRefreshRef.current = openedAt; // 첫 화면은 SessionProvider가 방금 세션을 받아 옴
    const refreshSessionIfDue = (now: number) => {
      if (now - lastRefreshRef.current < SESSION_REFRESH_INTERVAL_MS) return;
      lastRefreshRef.current = now;
      void getSession({ broadcast: false }); // 서버 세션 만료 연장(쿠키 재발급)
    };

    if (exempt) {
      // 안전 예외: 잠그지 않는다. 입력과 무관하게 활동 기록을 갱신해 같은 브라우저의 다른 탭이 유휴 잠금(로그아웃)으로
      //   이 화면의 세션까지 끊지 않게 하고, 5분 간격 연장으로 화면을 켜 둔 동안 12시간 만료가 오지 않게 한다
      const keepAlive = () => {
        const now = Date.now();
        writeActivity({ session: sessionKey, at: now });
        refreshSessionIfDue(now);
      };
      keepAlive();
      const keepAliveTimer = setInterval(keepAlive, IDLE_CHECK_INTERVAL_MS);
      return () => clearInterval(keepAliveTimer);
    }

    const lockEnabled = IDLE_LIMIT_MS > 0;
    const stored = readActivity();
    const sameSession = stored !== null && stored.session === sessionKey;
    // 화면 열기(마운트·화면 이동)는 활동으로 기록 — 클릭 없이 새로고침·주소창 이동만 하는 탐색·측정이 튕기지 않게.
    //   같은 세션 기록이 이미 한도를 넘었거나 다른 탭이 잠갔으면 기록하지 않고 아래 checkIdle()에서 즉시 잠근다
    const expiredOnOpen =
      lockEnabled && sameSession && (stored.locked === true || openedAt - stored.at >= IDLE_LIMIT_MS);
    let lastActivity = expiredOnOpen ? stored.at : openedAt;
    let lastWrite = expiredOnOpen ? 0 : openedAt;
    let locked = false;

    const lock = () => {
      if (locked) return;
      locked = true;
      writeActivity({ session: sessionKey, at: lastActivity, locked: true }); // 열린 다른 탭도 함께 잠그도록 표시
      // 🔒 잠금 = 로그아웃 후 '/'. LOGOUT/SESSION_EXPIRED 메시지는 보내지 않음(FCM 유지)
      signOut({ callbackUrl: '/' }).catch(() => {
        locked = false; // 오프라인 등으로 실패하면 다음 확인 때 다시 시도
      });
    };

    // 다른 탭의 활동도 반영해 유휴 시간을 계산
    const checkIdle = () => {
      if (locked) return;
      const shared = readActivity();
      const isShared = shared !== null && shared.session === sessionKey;
      if (isShared && shared.locked) {
        lock();
        return;
      }
      const sharedLast = isShared ? Math.max(shared.at, lastActivity) : lastActivity;
      if (Date.now() - sharedLast >= IDLE_LIMIT_MS) lock();
    };

    if (!expiredOnOpen) {
      writeActivity({ session: sessionKey, at: openedAt });
      refreshSessionIfDue(openedAt);
    }

    const onActivity = () => {
      if (locked) return; // 잠금 진행 중엔 잠금 표시를 덮어쓰지 않음
      const now = Date.now();
      lastActivity = now;
      if (now - lastWrite >= STORAGE_WRITE_INTERVAL_MS) {
        lastWrite = now;
        writeActivity({ session: sessionKey, at: now });
      }
      refreshSessionIfDue(now);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkIdle();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) checkIdle(); // 다른 탭의 잠금 표시를 바로 반영
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    let timer: ReturnType<typeof setInterval> | null = null;
    if (lockEnabled) {
      timer = setInterval(checkIdle, IDLE_CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', onVisible); // 앱·탭이 다시 보일 때(절전 해제 포함) 즉시 확인
      window.addEventListener('pageshow', checkIdle);
      window.addEventListener('storage', onStorage);
      // 화면을 열 때: 같은 세션의 기록이 이미 한도를 넘었으면 즉시 잠금(앱을 닫았다 다시 연 경우 포함)
      checkIdle();
    }

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', checkIdle);
      window.removeEventListener('storage', onStorage);
    };
    // pathname: 화면 이동도 '화면 열기'로 다시 판정하고, 예외 화면 ↔ 일반 화면 전환을 반영
  }, [status, sessionKey, exempt, pathname]);

  return null;
}
