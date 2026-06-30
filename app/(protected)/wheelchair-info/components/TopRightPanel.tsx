// app/(protected)/wheelchair-info/components/TopRightPanel.tsx
'use client';

import styles from '../page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';
import Image from 'next/image';
import { fmtUnit, fmtDist, hasValue, NO_DATA } from '@/lib/format';

// wc 타입을 any로 확장해서 새 변수명(current_battery) 접근 허용
interface Props {
  wc: DashboardWheelchair | any;
}

export const TopRightPanel = ({ wc }: Props) => {
  // ⭐️ [수정] DB(current_battery)와 소켓(batteryPercent) 둘 다 체크 (값 없으면 '-')
  const battery = wc?.status?.current_battery ?? wc?.status?.batteryPercent;

  // 주행거리 / 총 주행거리 (값 없으면 '-')
  const distance = wc?.status?.distance;
  const totalDistance = wc?.status?.total_distance;

  // 마지막 수신 시간 (DB값 없으면 현재 시간)
  const lastSeenDate = wc?.status?.last_seen ? new Date(wc.status.last_seen) : new Date();
  const lastUpdateDate = lastSeenDate.toLocaleDateString('ko-KR');
  const lastUpdateTime = lastSeenDate.toLocaleTimeString('ko-KR');

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
          {/* 값 없으면 '-' (실측 0만 0) */}
          <strong>{fmtUnit(battery, '%', 1)}</strong>
        </p>
        <p className={styles.batteryTimestamp} style={{ textAlign: 'center' }}>
          {lastUpdateDate}<br />{lastUpdateTime}
        </p>
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
          {/* 값 없으면 '-' */}
          <strong>{fmtDist(distance, ' m', 1)}</strong>
        </p>
        <p className={styles.drivingTitle} style={{ marginTop: '8px', fontSize: '12px' }}>총 주행거리</p>
        <p className={styles.drivingValue}>
          {hasValue(totalDistance) ? (
            <>
              <strong>
                {Number(totalDistance) >= 1000
                  ? (Number(totalDistance) / 1000).toFixed(1)
                  : Number(totalDistance).toFixed(1)}
              </strong>{' '}
              {Number(totalDistance) >= 1000 ? 'km' : 'm'}
            </>
          ) : (
            <strong>{NO_DATA}</strong>
          )}
        </p>
      </div>
    </div>
  );
};
