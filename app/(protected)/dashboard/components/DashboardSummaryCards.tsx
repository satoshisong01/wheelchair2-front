// 경로: app/(protected)/dashboard/components/DashboardSummaryCards.tsx
// 📝 설명: DB 컬럼명(current) 반영, 30초 통신 없으면 OFF→대기 반영, 카드 클릭 시 상태별 휠체어 리스트 모달

'use client';

import { useState } from 'react';
import Image from 'next/image';
import { DashboardWheelchair } from '@/types/wheelchair';
import styles from '../page.module.css';

/** 30초간 통신 없으면 OFF로 간주 (DrivingInfoPanel과 동일) */
const DISCONNECT_THRESHOLD_MS = 30 * 1000;

type StateKey = 'idle' | 'operating' | 'charging' | 'fall' | 'breakdown' | 'obstacle';

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
  onSelectWheelchair,
}: {
  wheelchairs: DashboardWheelchair[];
  onSelectWheelchair?: (wc: DashboardWheelchair) => void;
}) {
  const [modalState, setModalState] = useState<{ open: boolean; stateKey: StateKey; title: string; count: number } | null>(null);
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

  const stats = {
    operating: operatingWCs.length,
    charging: chargingWCs.length,
    idle: idleWCs.length,
    fall: 0,
    obstacle: 0,
  };

  const listByState: Record<StateKey, DashboardWheelchair[]> = {
    idle: idleWCs,
    operating: operatingWCs,
    charging: chargingWCs,
    fall: [],
    breakdown: [],
    obstacle: [],
  };

  const summaryData: { stateKey: StateKey; title: string; value: number; unit: string; alertType: string; iconUrl: string }[] = [
    { stateKey: 'idle', title: '대기', value: stats.idle, unit: '대', alertType: 'normal', iconUrl: '/icons/dashboard/wheelchair02.svg' },
    { stateKey: 'operating', title: '운행', value: stats.operating, unit: '대', alertType: 'operating', iconUrl: '/icons/dashboard/wheelchair03.svg' },
    { stateKey: 'charging', title: '충전', value: stats.charging, unit: '대', alertType: 'normal', iconUrl: '/icons/dashboard/battery-line.svg' },
    { stateKey: 'fall', title: '낙상 위험', value: stats.fall, unit: '대', alertType: stats.fall > 0 ? 'danger' : 'normal', iconUrl: '/icons/dashboard/dangers.svg' },
    { stateKey: 'breakdown', title: '고장', value: 0, unit: '대', alertType: 'danger', iconUrl: '/icons/dashboard/breakdown.svg' },
    { stateKey: 'obstacle', title: '장애물 감지', value: stats.obstacle, unit: '대', alertType: stats.obstacle > 0 ? 'danger' : 'normal', iconUrl: '/icons/dashboard/obstacle.svg' },
  ];

  const openModal = (stateKey: StateKey, title: string, count: number) => {
    setModalState({ open: true, stateKey, title, count });
  };

  const list = modalState ? listByState[modalState.stateKey] : [];

  return (
    <div className={styles.summarySection}>
      {summaryData.map((item) => (
        <div
          key={item.title}
          className={styles.summaryCard}
          role="button"
          tabIndex={0}
          onClick={() => openModal(item.stateKey, item.title, item.value)}
          onKeyDown={(e) => e.key === 'Enter' && openModal(item.stateKey, item.title, item.value)}
          style={{ cursor: 'pointer' }}
        >
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

      {/* 상태별 휠체어 리스트 모달 */}
      {modalState?.open && (
        <div className={styles.modalBackdrop} onClick={() => setModalState(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className={styles.modalHeader}>
              <h3>{modalState.title} ({modalState.count}대)</h3>
              <button type="button" onClick={() => setModalState(null)} className={styles.modalCloseButton} aria-label="닫기">
                &times;
              </button>
            </div>
            <div className={styles.modalBody} style={{ maxHeight: 360, overflowY: 'auto' }}>
              {list.length === 0 ? (
                <p className={styles.stateListEmpty}>해당 상태의 휠체어가 없습니다.</p>
              ) : (
                <ul className={styles.stateList}>
                  {list.map((wc) => (
                    <li
                      key={wc.id}
                      className={styles.stateListItem}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        onSelectWheelchair?.(wc);
                        setModalState(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onSelectWheelchair?.(wc);
                          setModalState(null);
                        }
                      }}
                    >
                      <span className={styles.stateListSerial}>
                        {wc.device_serial ?? (wc as { deviceSerial?: string }).deviceSerial ?? `ID ${String(wc.id).slice(0, 8)}`}
                      </span>
                      <span className={styles.stateListArrow}>→</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
