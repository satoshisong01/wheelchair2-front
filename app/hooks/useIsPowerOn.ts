// 경로: app/hooks/useIsPowerOn.ts
// 📝 전원 ON/OFF(통신 신선도) 판정 공용 훅 — 60초 이상 통신 없으면 OFF.
//    mobile-view 메인과 동일 규칙을 상세 페이지에서 재사용해, OFF 시 실시간 값을 '-'로 처리한다.

import { useEffect, useState } from 'react';

const DISCONNECT_THRESHOLD_MS = 60 * 1000;

export function useIsPowerOn(status: unknown, loading: boolean): boolean {
  const s = (status || {}) as Record<string, unknown>;
  const lastSeen = s.last_seen as string | Date | undefined;
  const [isDataFresh, setIsDataFresh] = useState(true);

  useEffect(() => {
    const check = () => {
      // 초기 로딩 중에는 깜빡임 방지를 위해 ON 유지
      if (loading) {
        setIsDataFresh(true);
        return;
      }
      if (!lastSeen) {
        setIsDataFresh(false);
        return;
      }
      const diff = Date.now() - new Date(lastSeen).getTime();
      setIsDataFresh(diff < DISCONNECT_THRESHOLD_MS);
    };
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [lastSeen, loading]);

  const isConnectedRaw = (s.is_connected ?? s.isConnected ?? true) as boolean;
  return isDataFresh && isConnectedRaw;
}
