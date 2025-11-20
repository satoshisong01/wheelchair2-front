'use client';

import Image from 'next/image';
import { DashboardWheelchair } from '@/types/wheelchair';
import styles from '../page.module.css'; // ‼️ 부모 폴더의 CSS 사용

// [추가] 벨 아이콘 경로 정의 (컴포넌트 내부로 이동)
const alertIcons = {
  normal: '/icons/dashboard/lamp-gray.svg',
  operating: '/icons/dashboard/lamp-green.svg',
  danger: '/icons/dashboard/lamp-red.svg',
};

// ‼️ export function으로 변경
export function DashboardSummaryCards({
  wheelchairs,
}: {
  wheelchairs: DashboardWheelchair[];
}) {
  // --- 집계 로직 (변경 없음) ---
  const operatingWCs = wheelchairs.filter(
    (w) => w.status?.speed && w.status.speed > 0
  );
  const chargingWCs = wheelchairs.filter(
    (w) =>
      (!w.status?.speed || w.status.speed === 0) &&
      w.status?.current &&
      w.status.current > 0
  );
  const idleWCs = wheelchairs.filter(
    (w) =>
      (!w.status?.speed || w.status.speed === 0) &&
      (!w.status?.current || w.status.current <= 0)
  );
  const stats = {
    operating: operatingWCs.length,
    charging: chargingWCs.length,
    idle: idleWCs.length,
    fall: 0,
    obstacle: 0,
  };

  // --- 데이터 (변경 없음) ---
  const summaryData = [
    {
      title: '대기',
      value: stats.idle,
      unit: '대',
      alertType: 'normal',
      iconUrl: '/icons/dashboard/wheelchair02.svg',
    },
    {
      title: '운행',
      value: stats.operating,
      unit: '대',
      alertType: 'operating',
      iconUrl: '/icons/dashboard/wheelchair03.svg',
    },
    {
      title: '충전',
      value: stats.charging,
      unit: '대',
      alertType: 'normal',
      iconUrl: '/icons/dashboard/battery-line.svg',
    },
    {
      title: '낙상 위험',
      value: stats.fall,
      unit: '대',
      alertType: stats.fall > 0 ? 'danger' : 'normal',
      iconUrl: '/icons/dashboard/dangers.svg',
    },
    {
      title: '고장',
      value: 0,
      unit: '대',
      alertType: 'danger',
      iconUrl: '/icons/dashboard/breakdown.svg',
    },
    {
      title: '장애물 감지',
      value: stats.obstacle,
      unit: '대',
      alertType: stats.obstacle > 0 ? 'danger' : 'normal',
      iconUrl: '/icons/dashboard/obstacle.svg',
    },
  ];

  return (
    <div className={styles.summarySection}>
      {summaryData.map((item) => (
        <div key={item.title} className={styles.summaryCard}>
          <div className={styles.contentLeft}>
            <div className={styles.titleRow}>
              <div className={styles.summaryCardTitle}>{item.title}</div>
              <Image
                src={
                  alertIcons[item.alertType as keyof typeof alertIcons] ||
                  alertIcons.normal
                }
                alt={`${item.title} 상태`}
                width={20}
                height={20}
                className={styles.alertBell}
              />
            </div>
            <div className={styles.summaryCardValue}>
              {item.value}
              <span>{item.unit}</span>
            </div>
          </div>
          <div className={styles.iconWrapper}>
            <Image
              src={item.iconUrl}
              alt={item.title}
              fill
              sizes="50px"
              className={styles.mainIcon}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
