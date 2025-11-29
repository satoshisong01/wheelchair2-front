// 경로: app/(protected)/dashboard/components/DashboardSummaryCards.tsx
// 📝 설명: DB 컬럼명(current) 반영 및 상태 판단 로직 통일

'use client';

import Image from 'next/image';
import { DashboardWheelchair } from '@/types/wheelchair';
import styles from '../page.module.css';

const alertIcons = {
  normal: '/icons/dashboard/lamp-gray.svg',
  operating: '/icons/dashboard/lamp-green.svg',
  danger: '/icons/dashboard/lamp-red.svg',
};

export function DashboardSummaryCards({
  wheelchairs,
}: {
  wheelchairs: DashboardWheelchair[];
}) {
  // ⭐️ [핵심 수정] 상태 집계 로직 통일

  // 1. 운행 중: 속도가 0.1 이상일 때
  const operatingWCs = wheelchairs.filter((w) => {
    const speed = w.status?.current_speed ?? 0;
    return speed > 0.1;
  });

  // 2. 충전 중: 운행 중이 아니면서, 전류(current)가 0보다 클 때
  const chargingWCs = wheelchairs.filter((w) => {
    const speed = w.status?.current_speed ?? 0;
    // 🚨 [수정] current_amperage -> current (DB 컬럼명 일치)
    const current = w.status?.current ?? 0;
    return speed <= 0.1 && current > 0;
  });

  // 3. 대기 중: 운행도 아니고 충전도 아닐 때
  const idleWCs = wheelchairs.filter((w) => {
    const speed = w.status?.current_speed ?? 0;
    const current = w.status?.current ?? 0;
    return speed <= 0.1 && current <= 0;
  });

  // 4. 알람 카운트 (API나 소켓에서 받은 alarms 배열 길이를 사용하는 것이 정확하나, 여기서는 일단 0 처리)
  // (실제 알람 연동은 page.tsx에서 alarms state를 prop으로 받아와야 정확함. 현재는 구조 유지)
  const stats = {
    operating: operatingWCs.length,
    charging: chargingWCs.length,
    idle: idleWCs.length,
    fall: 0, // page.tsx에서 계산해서 넘겨주는 구조로 추후 개선 권장
    obstacle: 0,
  };

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
              {item.value} <span>{item.unit}</span>
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
