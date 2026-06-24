'use client';

// components/common/IdleLogout.tsx — 유휴 세션 자동 잠금/로그아웃 (의료기기 사이버보안 요구사항 UC-03)
// 사용자 입력이 일정 시간(기본 30분) 없으면 자동으로 로그아웃하여 세션을 잠근다.

import { useEffect, useRef } from 'react';
import { signOut, useSession } from 'next-auth/react';

const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30분

export default function IdleLogout() {
  const { status } = useSession();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const logout = () => {
      signOut({ callbackUrl: '/' });
    };
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(logout, IDLE_LIMIT_MS);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset(); // 최초 타이머 시작

    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [status]);

  return null;
}
