// 📁 components/common/BatteryStatus.tsx

'use client';

import { DashboardWheelchair, WheelchairStatus } from '@/types/wheelchair';
import styles from './BatteryStatus.module.css';

// [수정 1] ‼️ Props 인터페이스 (변경 없음, 이미 완성됨) ‼️
interface BatteryStatusProps {
  wheelchairs: DashboardWheelchair[];
  selectedWheelchair?: DashboardWheelchair | null;
  onSelectWheelchair: (
    e: React.MouseEvent,
    wheelchair: DashboardWheelchair
  ) => void;
}

// --- 헬퍼 함수들 (변경 없음) ---
const getStatusText = (battery: number): string => {
  if (battery < 20) return '충전필요';
  if (battery < 50) return '주의';
  return '정상';
};
const getStatusClass = (battery: number): string => {
  if (battery < 20) return styles.badgeCritical;
  if (battery < 50) return styles.badgeWarning;
  return styles.badgeNormal;
};
const getProgressClass = (battery: number): string => {
  if (battery > 50) return styles.progressFillHigh;
  if (battery > 20) return styles.progressFillMedium;
  return styles.progressFillLow;
};
// --- 헬퍼 함수 끝 ---

// [수정 2] ‼️ Props 받기 (변경 없음, 이미 완성됨) ‼️
export default function BatteryStatus({
  wheelchairs,
  selectedWheelchair,
  onSelectWheelchair,
}: BatteryStatusProps) {
  // --- 🔽🔽🔽 [신규 추가] ‼️ 선택 여부 확인 ‼️ 🔽🔽🔽 ---
  const isWheelchairSelected = !!selectedWheelchair;
  // --- 🔼🔼🔼 [신규 추가] 🔼🔼🔼 ---

  return (
    // --- 🔽🔽🔽 [수정 3] ‼️ 동적 클래스 적용 ‼️ 🔽🔽🔽 ---
    <div
      className={`
        ${styles.container}
        ${isWheelchairSelected ? styles.shrunk : ''}
      `}
    >
      {/* --- 🔼🔼🔼 [수정 3] 🔼🔼🔼 --- */}

      {wheelchairs.map((wheelchair) => {
        const battery = wheelchair.status?.batteryPercent ?? 0;
        const name = wheelchair.nickname || wheelchair.deviceSerial;
        const isActive = selectedWheelchair?.id === wheelchair.id;

        return (
          <div
            key={wheelchair.id}
            onClick={(e) => onSelectWheelchair(e, wheelchair)}
            className={`
              ${styles.card} 
              ${styles.clickableCard} 
              ${isActive ? styles.activeCard : ''}
            `}
          >
            <div className={styles.header}>
              <span className={styles.name}>{name}</span>
              <span className={`${styles.badge} ${getStatusClass(battery)}`}>
                {getStatusText(battery)}
              </span>
            </div>

            <div className={styles.progressBar}>
              <div
                className={`${styles.progressFill} ${getProgressClass(
                  battery
                )}`}
                style={{ width: `${battery}%` }}
              />
            </div>
            <p className={styles.batteryPercentText}>{battery.toFixed(1)}%</p>
          </div>
        );
      })}

      {wheelchairs.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>연결된 휠체어가 없습니다.</p>
        </div>
      )}
    </div>
  );
}
