// 경로: app/(protected)/wheelchair-info/components/WheelchairStatePanel.tsx

'use client';

import { useState, useEffect } from 'react'; // 🟢 useState, useEffect 추가
import styles from '../page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';
import Image from 'next/image';

// ⏳ 통신 두절 판단 기준 (30초)
const DISCONNECT_THRESHOLD_MS = 30 * 1000;

const ALL_STATES = [
  { key: 'idle', label: '대기', iconUrl: '/icons/dashboard/wheelchair02.svg', type: 'status' },
  { key: 'charging', label: '충전', iconUrl: '/icons/dashboard/battery-line.svg', type: 'status' },
  { key: 'operating', label: '운행', iconUrl: '/icons/dashboard/wheelchair03.svg', type: 'status' },
  { key: 'error', label: '고장', iconUrl: '/icons/dashboard/breakdown.svg', type: 'alert' },
  { key: 'fall', label: '낙상 위험', iconUrl: '/icons/dashboard/dangers.svg', type: 'alert' },
  {
    key: 'obstacle',
    label: '장애물 감지',
    iconUrl: '/icons/dashboard/obstacle.svg',
    type: 'alert',
  },
];

// ⭐️ [수정] 상태 결정 로직 (isDataFresh 인자 추가)
function getActiveState(wc: DashboardWheelchair | null, isDataFresh: boolean): string {
  if (!wc || !wc.status) return 'idle';

  // 🟢 데이터가 끊겼으면(30초 이상) 무조건 '대기(idle)' 반환
  if (!isDataFresh) return 'idle';

  const status = wc.status as any;

  // 1. 운행
  const speed = status.current_speed ?? status.speed ?? 0;
  if (speed > 0) return 'operating';

  // 2. 충전
  const current = status.current ?? 0;
  if (current > 0) return 'charging';

  // 3. 연결 해제
  const isConnected = status.is_connected ?? status.isConnected ?? true;
  if (isConnected === false) return 'idle';

  return 'idle';
}

function getActiveAlerts(wc: DashboardWheelchair | null): Set<string> {
  const activeAlerts = new Set<string>();
  if (!wc || !wc.status) return activeAlerts;
  const status = wc.status as any;

  const battery = Number(status.current_battery || 100);
  const incline = Number(status.incline_angle || 0);
  const temp = Number(status.temperature || 25);

  if (incline > 30) activeAlerts.add('fall');
  if (battery < 10) activeAlerts.add('error');
  if (temp > 50) activeAlerts.add('error');

  return activeAlerts;
}

const StateIcon = ({
  label,
  iconUrl,
  isActive,
}: {
  label: string;
  iconUrl: string;
  isActive: boolean;
}) => (
  <div className={styles.stateIconBox} title={label}>
    <div className={styles.iconBackground}>
      <Image src={iconUrl} alt={label} width={40} height={40} />
    </div>
    <span className={styles.stateLabel}>{label}</span>
    <div className={`${styles.stateCircle} ${isActive ? styles.active : ''}`}></div>
  </div>
);

// 3. [메인] WheelchairStatePanel
export const WheelchairStatePanel = ({ wc }: { wc: DashboardWheelchair | null }) => {
  const [isDataFresh, setIsDataFresh] = useState(true);

  // 🟢 1. 데이터 신선도 체크 (1초마다 실행)
  useEffect(() => {
    const status = (wc?.status || {}) as any;
    const lastSeen = status.last_seen;

    const checkFreshness = () => {
      if (!lastSeen) {
        setIsDataFresh(false); // last_seen이 없으면 그냥 '죽은' 상태로 간주 (또는 true로 할 수도 있음)
        return;
      }
      const diff = Date.now() - new Date(lastSeen).getTime();
      setIsDataFresh(diff < DISCONNECT_THRESHOLD_MS);
    };

    checkFreshness();
    const timer = setInterval(checkFreshness, 1000);
    return () => clearInterval(timer);
  }, [wc]); // wc 데이터가 바뀔 때마다(소켓 수신) 타이머 재설정은 안 하고, 내부 값만 갱신하도록

  // 🟢 2. 상태 결정 시 isDataFresh 전달
  const activeStateKey = getActiveState(wc, isDataFresh);
  const activeAlertKeys = getActiveAlerts(wc);

  const statusStates = ALL_STATES.filter((s) => s.type === 'status');
  const alertStates = ALL_STATES.filter((s) => s.type === 'alert');

  return (
    <div className={`${styles.card} ${styles.wheelchairStateCard}`}>
      <h2 className={styles.sectionTitle}>휠체어 상태</h2>
      <div className={styles.stateContainer}>
        <div className={styles.stateRow}>
          <div className={`${styles.stateRowLabel} ${styles.statusLabel}`}>상태 유형</div>
          <div className={styles.iconFlexContainer}>
            {statusStates.map((state) => (
              <StateIcon
                key={state.key}
                label={state.label}
                iconUrl={state.iconUrl}
                isActive={activeStateKey === state.key}
              />
            ))}
          </div>
        </div>
        <div className={styles.stateRow}>
          <div className={`${styles.stateRowLabel} ${styles.alertLabel}`}>경고 유형</div>
          <div className={styles.iconFlexContainer}>
            {alertStates.map((state) => (
              <StateIcon
                key={state.key}
                label={state.label}
                iconUrl={state.iconUrl}
                isActive={activeAlertKeys.has(state.key)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WheelchairStatePanel; // default export 추가
