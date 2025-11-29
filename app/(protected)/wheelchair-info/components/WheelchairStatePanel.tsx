// 경로: app/(protected)/wheelchair-info/components/WheelchairStatePanel.tsx
// 📝 설명: 원본 디자인 및 StateIcon 컴포넌트 유지, getActiveState 로직만 수정

'use client';

import styles from '../page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';
import Image from 'next/image';

// [데이터] 6가지 휠체어 상태 정의 (기존 유지)
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

// ⭐️ [로직 수정] '상태 유형' (빌드 에러 및 변수명 수정)
function getActiveState(wc: DashboardWheelchair | null): string {
  if (!wc || !wc.status) return 'idle';

  // ⭐️ [핵심 FIX] status를 any로 캐스팅하여 새 DB 컬럼명 접근 허용
  const status = wc.status as any;

  // 1. 운행 (speed -> current_speed로 변경)
  const speed = status.current_speed ?? status.speed ?? 0;
  if (speed > 0) return 'operating';

  // 2. 충전 (전류 current가 양수일 때)
  const current = status.current ?? 0;
  if (current > 0) return 'charging';

  // 3. 대기/연결 상태 (isConnected -> is_connected로 변경)
  const isConnected = status.is_connected ?? status.isConnected ?? true;
  if (isConnected === false) return 'idle';

  return 'idle';
}

// [로직] '경고 유형' (다중 선택) - 기존 로직 유지
function getActiveAlerts(wc: DashboardWheelchair | null): Set<string> {
  const activeAlerts = new Set<string>();
  if (!wc || !wc.status) return activeAlerts;

  const status = wc.status as any; // Type casting

  const battery = Number(status.current_battery || 100);
  const incline = Number(status.incline_angle || 0);
  const temp = Number(status.temperature || 25);

  // 1. 낙상 위험: 기기 기울기가 30도를 초과할 때
  if (incline > 30) {
    activeAlerts.add('fall');
  }

  // 2. 고장/에러: 배터리가 10% 미만일 때
  if (battery < 10) {
    activeAlerts.add('error');
  }

  // 3. 고장/에러: 온도(Overheating)가 50도를 초과할 때
  if (temp > 50) {
    activeAlerts.add('error');
  }

  // 4. 장애물 감지 (로직이 없으므로 항상 false)
  // if (status.isObstacleDetected) activeAlerts.add('obstacle');

  return activeAlerts;
}

// [UI] 개별 아이콘 (기존 이미지 태그 및 스타일 유지)
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
      <Image
        src={iconUrl}
        alt={label}
        width={40}
        height={40}
        // 💡 [참고] Next.js Image를 쓸 때 스타일이 깨진다면
        // 1. next.config.js에 domain 허용
        // 2. CSS 모듈에서 Image의 부모 div에 width/height가 고정되어 있는지 확인
      />
    </div>
    <span className={styles.stateLabel}>{label}</span>
    <div
      className={`${styles.stateCircle} ${isActive ? styles.active : ''}`}
    ></div>
  </div>
);

// 3. [메인] WheelchairStatePanel
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
