// app/(protected)/wheelchair-info/components/WheelchairStatePanel.tsx
'use client';

import styles from '../page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';
import Image from 'next/image';

// [데이터] 6가지 휠체어 상태 정의
const ALL_STATES = [
  {
    key: 'idle',
    label: '대기',
    iconUrl: '/icons/dashboard/wheelchair02.svg',
    type: 'status',
  },
  {
    key: 'charging',
    label: '충전',
    iconUrl: '/icons/dashboard/battery-line.svg',
    type: 'status',
  },
  {
    key: 'operating',
    label: '운행',
    iconUrl: '/icons/dashboard/wheelchair03.svg',
    type: 'status',
  },
  {
    key: 'error',
    label: '고장',
    iconUrl: '/icons/dashboard/breakdown.svg',
    type: 'alert',
  },
  {
    key: 'fall',
    label: '낙상 위험',
    iconUrl: '/icons/dashboard/dangers.svg',
    type: 'alert',
  },
  {
    key: 'obstacle',
    label: '장애물 감지',
    iconUrl: '/icons/dashboard/obstacle.svg',
    type: 'alert',
  },
];

// [로직] '상태 유형' (단일 선택)
function getActiveState(wc: DashboardWheelchair | null): string {
  if (!wc || !wc.status) return 'idle';
  const status = wc.status;
  if (status.speed && status.speed > 0) return 'operating';
  if (status.current && status.current > 0) return 'charging';
  if (status.isConnected === false) return 'idle';
  return 'idle';
}

// [로직] '경고 유형' (다중 선택)
function getActiveAlerts(wc: DashboardWheelchair | null): Set<string> {
  const activeAlerts = new Set<string>();
  if (!wc || !wc.status) return activeAlerts;
  const status = wc.status;

  // ‼️ [중요] 실제 데이터 구조에 맞게 수정 필요
  // if (status.isError) activeAlerts.add('error');
  // if (status.isFall) activeAlerts.add('fall');
  // if (status.isObstacle) activeAlerts.add('obstacle');

  // [임시 코드]
  if (wc.id % 2 === 0) {
    activeAlerts.add('error');
  }
  return activeAlerts;
}

// [UI] 개별 아이콘
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
    <div
      className={`${styles.stateCircle} ${isActive ? styles.active : ''}`}
    ></div>
  </div>
);

// 3. [메인] WheelchairStatePanel (휠체어 상태 - 중앙 하단)
export const WheelchairStatePanel = ({
  wc,
}: {
  wc: DashboardWheelchair | null;
}) => {
  const activeStateKey = getActiveState(wc);
  const activeAlertKeys = getActiveAlerts(wc);

  const statusStates = ALL_STATES.filter((s) => s.type === 'status');
  const alertStates = ALL_STATES.filter((s) => s.type === 'alert');

  return (
    <div className={`${styles.card} ${styles.wheelchairStateCard}`}>
      <h2 className={styles.sectionTitle}>휠체어 상태</h2>
      <div className={styles.stateContainer}>
        {/* Row 1: 상태 유형 */}
        <div className={styles.stateRow}>
          <div className={`${styles.stateRowLabel} ${styles.statusLabel}`}>
            상태 유형
          </div>
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
        {/* Row 2: 경고 유형 */}
        <div className={styles.stateRow}>
          <div className={`${styles.stateRowLabel} ${styles.alertLabel}`}>
            경고 유형
          </div>
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
