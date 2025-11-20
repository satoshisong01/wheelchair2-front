// app/(protected)/wheelchair-info/components/TopRightPanel.tsx
'use client';

import styles from '../page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';
import Image from 'next/image';

// 6. TopRightPanel (주행거리 & 배터리 상태 - 중앙 상단)
export const TopRightPanel = ({ wc }: { wc: DashboardWheelchair | null }) => (
  <div className={styles.topRightPanel}>
    <div className={styles.batteryStatus}>
      <p className={styles.batteryTitle}>배터리 충전 상태</p>
      <Image
        src="/icons/secondtab/battery-line02.svg"
        alt="배터리 아이콘"
        width={100}
        height={100}
        priority
      />
      <p className={styles.batteryValue}>
        <strong>{wc?.status?.batteryPercent || 0}%</strong>
      </p>
      <p className={styles.batteryTimestamp}>2025/11/07 09:00:00</p>
    </div>
    <div className={styles.drivingDistance}>
      <p className={styles.drivingTitle}>주행 거리</p>
      <Image
        src="/icons/secondtab/driving-distance.svg"
        alt="주행 거리 아이콘"
        width={100}
        height={100}
        priority
      />
      <p className={styles.drivingValue}>
        <strong>{wc?.status?.distance?.toFixed(1) || 0}</strong> km
      </p>
    </div>
  </div>
);
