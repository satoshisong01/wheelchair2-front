// app/(protected)/wheelchair-info/components/TopRightPanel.tsx
'use client';

import styles from '../page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';
import Image from 'next/image';

// wc 타입을 any로 확장해서 새 변수명(current_battery) 접근 허용
interface Props {
  wc: DashboardWheelchair | any;
}

export const TopRightPanel = ({ wc }: Props) => {
  // ⭐️ [수정] DB(current_battery)와 소켓(batteryPercent) 둘 다 체크
  const battery =
    wc?.status?.current_battery ?? wc?.status?.batteryPercent ?? 0;

  // 주행거리
  const distance = wc?.status?.distance ?? 0;

  // 마지막 수신 시간 (DB값 없으면 현재 시간)
  const lastUpdate = wc?.status?.last_seen
    ? new Date(wc.status.last_seen).toLocaleString()
    : new Date().toLocaleString();

  return (
    <div className={styles.topRightPanel}>
      {/* 배터리 상태 */}
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
          {/* 수정한 변수 사용 */}
          <strong>{battery}%</strong>
        </p>
        <p className={styles.batteryTimestamp}>{lastUpdate}</p>
      </div>

      {/* 주행 거리 */}
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
          {/* 수정한 변수 사용 */}
          <strong>{distance.toFixed(1)}</strong> km
        </p>
      </div>
    </div>
  );
};
