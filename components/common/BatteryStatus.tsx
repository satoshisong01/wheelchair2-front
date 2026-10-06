'use client';

import { DashboardWheelchair } from '@/types/wheelchair';
import styles from './BatteryStatus.module.css';

// Props 인터페이스 (변경 없음)
interface BatteryStatusProps {
  wheelchairs: DashboardWheelchair[];
  selectedWheelchair?: DashboardWheelchair | null;
  onSelectWheelchair: (
    e: React.MouseEvent,
    wheelchair: DashboardWheelchair
  ) => void;
  // 목록이 비었을 때 문구 — 아직 불러오는 중이면 바꿔 넘겨 '연결된 휠체어 없음'과 구분
  emptyText?: string;
}

// --- 헬퍼 함수들 (배터리 값을 기준으로 UI 클래스 결정) ---
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

export default function BatteryStatus({
  wheelchairs,
  selectedWheelchair,
  onSelectWheelchair,
  emptyText = '연결된 휠체어가 없습니다.',
}: BatteryStatusProps) {
  // --- 🔽🔽🔽 [신규 추가] ‼️ 선택 여부 확인 ‼️ 🔽🔽🔽 ---
  const isWheelchairSelected = !!selectedWheelchair; // --- 🔼🔼🔼 [신규 추가] 🔼🔼🔼 ---
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
        // ⭐️ [핵심 FIX] DB/Worker가 저장한 current_battery 필드를 사용
        // null일 경우 0으로 처리하여 UI가 깨지지 않게 합니다.
        const rawBattery = wheelchair.status?.current_battery;
        const battery =
          rawBattery !== undefined && rawBattery !== null
            ? Math.round(rawBattery)
            : 0;
        // ⭐️ END FIX

        const name = wheelchair.nickname || wheelchair.device_serial; // 닉네임이 없으면 시리얼 사용
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
            {/* ⭐️ [UI FIX] 배터리 값을 정수로 표시 */}
            <p className={styles.batteryPercentText}>{battery}%</p>
          </div>
        );
      })}

      {wheelchairs.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>{emptyText}</p>
        </div>
      )}
    </div>
  );
}
