// 경로: app/(protected)/dashboard/components/DashboardSummaryCards.tsx
// 📝 설명: DB 컬럼명(current) 반영, 30초 통신 없으면 OFF→대기 반영 (DrivingInfoPanel과 동일 기준)

'use client';

import Image from 'next/image';
import { DashboardWheelchair } from '@/types/wheelchair';
import styles from '../page.module.css';

/** 30초간 통신 없으면 OFF로 간주 (DrivingInfoPanel과 동일) */
const DISCONNECT_THRESHOLD_MS = 30 * 1000;

const alertIcons = {
  normal: '/icons/dashboard/lamp-gray.svg',
  operating: '/icons/dashboard/lamp-green.svg',
  danger: '/icons/dashboard/lamp-red.svg',
};

function isDataFresh(w: DashboardWheelchair): boolean {
  const lastSeen = (w.status as { last_seen?: string; lastSeen?: string })?.last_seen ?? (w.status as { last_seen?: string; lastSeen?: string })?.lastSeen;
  if (!lastSeen) return false;
  const diff = Date.now() - new Date(lastSeen).getTime();
  return diff < DISCONNECT_THRESHOLD_MS;
}

export function DashboardSummaryCards({
  wheelchairs,
}: {
  wheelchairs: DashboardWheelchair[];
}) {
  // 30초 통신 없으면 해당 기기는 운행/충전이 아니라 대기로 집계

  // 1. 운행 중: 데이터가 신선하고, 속도가 0.1 이상일 때
  const operatingWCs = wheelchairs.filter((w) => {
    if (!isDataFresh(w)) return false;
    const speed = w.status?.current_speed ?? 0;
    return speed > 0.1;
  });

  // 2. 충전 중: 데이터가 신선하고, 운행이 아니면서 전류가 0보다 클 때
  const chargingWCs = wheelchairs.filter((w) => {
    if (!isDataFresh(w)) return false;
    const speed = w.status?.current_speed ?? 0;
    const current = w.status?.current ?? 0;
    return speed <= 0.1 && current > 0;
  });

  // 3. 대기 중: (데이터 신선하고 운행/충전 아님) 또는 30초 통신 없음
  const idleWCs = wheelchairs.filter((w) => {
    if (!isDataFresh(w)) return true; // 통신 끊김 → 대기로 집계
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
