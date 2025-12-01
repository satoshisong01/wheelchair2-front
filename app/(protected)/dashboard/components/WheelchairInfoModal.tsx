'use client';

import { DashboardWheelchair } from '@/types/wheelchair';
import styles from '../page.module.css'; // ‼️ 부모 폴더의 CSS 사용

// ‼️ export function으로 변경
export function WheelchairInfoModal({
  isOpen,
  onClose,
  wheelchair,
  onViewDetails,
}: {
  isOpen: boolean;
  onClose: () => void;
  wheelchair: DashboardWheelchair | any | null; // 🚨 any 허용 (유연한 접근)
  onViewDetails: () => void;
}) {
  if (!isOpen || !wheelchair) return null;

  const modelName =
    wheelchair.modelName || wheelchair.model_name || '정보 없음';

  // 상태 정보 안전하게 가져오기
  const status = wheelchair.status || {};
  const batteryValue = status.current_battery ?? status.batteryPercent ?? 0;
  const speedValue = status.current_speed ?? status.speed ?? 0;

  return (
    // 모달 배경 (Backdrop)
    <div className={styles.modalBackdrop} onClick={onClose}>
      {/* 모달 컨텐츠 */}
      <div
        className={styles.modalContent}
        onClick={(e) => e.stopPropagation()} // 이벤트 전파 중단
      >
        <div className={styles.modalHeader}>
          <h3>
            {/* ⭐️ [FIX] ID 대신 시리얼 넘버를 크게 표시 */}
            {wheelchair.deviceSerial ||
              wheelchair.device_serial ||
              'Unknown Device'}
          </h3>
          {/* ‼️ 디버깅용 ID 노출 (요청에 따라 숨김) */}
          <span style={{ fontSize: '10px', color: '#999' }}>
            (ID: {wheelchair.id.substring(0, 8)}...)
          </span>

          <button onClick={onClose} className={styles.modalCloseButton}>
            &times;
          </button>
        </div>

        <div className={styles.modalBody}>
          <p>
            <strong>모델명:</strong> {modelName}
          </p>

          <p>
            {/* ⭐️ [FIX] current_battery 사용 및 % 포맷 적용 */}
            <strong>배터리:</strong>
            {batteryValue ? `${Math.round(batteryValue)} %` : 'N/A %'}
          </p>

          <p>
            <strong>상태:</strong>
            {speedValue && speedValue > 0 ? '운행 중' : '대기'}
          </p>

          <p>
            {/* ⭐️ [FIX] current_speed 사용 */}
            <strong>속도:</strong> {speedValue?.toFixed(1) || '0'}
            m/s
          </p>
        </div>

        <div className={styles.modalFooter}>
          <button
            onClick={onViewDetails}
            className={styles.modalViewDetailsButton}
          >
            자세히 보기
          </button>
        </div>
      </div>
    </div>
  );
}
