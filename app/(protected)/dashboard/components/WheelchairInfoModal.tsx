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
  wheelchair: DashboardWheelchair | null;
  onViewDetails: () => void;
}) {
  if (!isOpen || !wheelchair) return null;

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
            {wheelchair.deviceSerial} (ID: {wheelchair.id})
          </h3>
          <button onClick={onClose} className={styles.modalCloseButton}>
            &times;
          </button>
        </div>
        <div className={styles.modalBody}>
          {/* <p>
            <strong>사용자:</strong>
            {wheelchair.users?.[0]?.nickname || '배정 안됨'}
          </p> */}
          <p>
            <strong>모델명:</strong> {wheelchair.modelName}
          </p>
          <p>
            <strong>배터리:</strong>
            {wheelchair.status?.batteryPercent?.toFixed(0) || 'N/A'} %
          </p>
          <p>
            <strong>상태:</strong>
            {wheelchair.status?.speed && wheelchair.status.speed > 0
              ? '운행 중'
              : wheelchair.status?.current && wheelchair.status.current > 0
              ? '충전 중'
              : '대기'}
          </p>
          <p>
            <strong>속도:</strong> {wheelchair.status?.speed?.toFixed(1) || '0'}
            km/h
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
