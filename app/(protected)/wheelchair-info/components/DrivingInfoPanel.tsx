// app/(protected)/wheelchair-info/components/DrivingInfoPanel.tsx
'use client';

import styles from '../page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';

export const DrivingInfoPanel = ({
  wc,
}: {
  wc: DashboardWheelchair | null;
}) => (
  <div className={`${styles.card} ${styles.drivingInfoCard}`}>
    <h2 className={styles.sectionTitle}>운행 정보</h2>
    <div className={styles.drivingGrid}>
      <p>
        전원: <strong>{wc?.status?.isConnected ? 'ON' : 'OFF'}</strong>
      </p>
      <p>
        주행 시간: <strong>1 h</strong>
      </p>
      <p>
        전압: <strong>{wc?.status?.voltage?.toFixed(1) || 0} V</strong>
      </p>
      <p>
        주행 거리: <strong>{wc?.status?.distance?.toFixed(1) || 0} km</strong>
      </p>
      <p>
        전류: <strong>{wc?.status?.current?.toFixed(1) || 0} A</strong>
      </p>
      <p>
        속도: <strong>{wc?.status?.speed?.toFixed(1) || 0} km/h</strong>
      </p>
      <p>
        주행유지시간: <strong>3 min</strong>
      </p>
      <p>
        휠체어 사용 시간: <strong>7 h</strong>
      </p>
    </div>
  </div>
);
