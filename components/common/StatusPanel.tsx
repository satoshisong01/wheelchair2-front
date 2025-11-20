'use client';

import { DashboardWheelchair } from '@/types/wheelchair';
import styles from './StatusPanel.module.css';

// --- 🔽🔽🔽 [수정 1] onDeselect prop 타입 추가 🔽🔽🔽 ---
interface StatusPanelProps {
  wheelchair?: DashboardWheelchair | null;
  onDeselect: () => void; // 선택 해제 함수
}
// --- 🔼🔼🔼 [수정 1] 🔼🔼🔼 ---

export default function StatusPanel({
  wheelchair,
  onDeselect,
}: StatusPanelProps) {
  if (!wheelchair) {
    return (
      <div className={styles.container}>
        <p className={styles.message}>
          지도에서 휠체어를 선택하여 상세 정보를 확인하세요
        </p>
      </div>
    );
  }

  // (N/A 버그를 해결했던) status 객체 추출
  const status = wheelchair.status;

  return (
    <div className={styles.container}>
      {/* --- 🔽🔽🔽 [수정 2] 제목 영역 + 닫기 버튼 추가 🔽🔽🔽 --- */}
      <div className={styles.titleWrapper}>
        <h2 className={styles.title}>
          {wheelchair.nickname || wheelchair.deviceSerial || '휠체어 이름'}
        </h2>
        <button
          onClick={onDeselect} // 클릭 시 부모의 setSelectedWheelchair(null) 호출
          className={styles.closeButton}
          title="선택 해제"
        >
          &times; {/* 'X' 문자 */}
        </button>
      </div>
      {/* --- 🔼🔼🔼 [수정 2] 🔼🔼🔼 --- */}

      {/* 연결 상태 */}
      <div className={styles.connectionStatus}>
        <div
          className={`${styles.statusDot} ${
            status?.isConnected ? styles.connected : styles.disconnected
          }`}
        />
        <span className={styles.statusText}>
          {status?.isConnected ? '연결됨' : '연결 끊김'}
        </span>
      </div>

      {/* 상태 정보 */}
      <div className={styles.infoSection}>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>배터리:</span>
          <span className={styles.infoValue}>
            {status?.batteryPercent || 0}%
          </span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>전압:</span>
          <span className={styles.infoValue}>{status?.voltage || 0}V</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>전류:</span>
          <span className={styles.infoValue}>{status?.current || 0}A</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>속도:</span>
          <span className={styles.infoValue}>{status?.speed || 0} km/h</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>등각도:</span>
          <span className={styles.infoValue}>{status?.inclineAngle || 0}°</span>
        </div>
      </div>

      {/* 위치 정보 */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>위치 정보</p>
        <div className={styles.sectionRow}>
          <span className={styles.sectionLabel}>위도:</span>
          <span>{status?.latitude?.toFixed(6) || 'N/A'}</span>
        </div>
        <div className={styles.sectionRow}>
          <span className={styles.sectionLabel}>경도:</span>
          <span>{status?.longitude?.toFixed(6) || 'N/A'}</span>
        </div>
      </div>

      {/* 온도/습도 */}
      <div className={styles.section}>
        <div className={styles.sectionRow}>
          <span className={styles.infoLabel}>온도:</span>
          <span>{status?.temperature || 0}°C</span>
        </div>
        <div className={styles.sectionRow}>
          <span className={styles.infoLabel}>습도:</span>
          <span>{status?.humidity || 0}%</span>
        </div>
      </div>
    </div>
  );
}
