'use client';

import { DashboardWheelchair } from '@/types/wheelchair';
import styles from './StatusPanel.module.css';

// ⭐️ [FIX] Props 인터페이스를 유연하게 정의 (타입 에러 방지)
interface StatusPanelProps {
  wheelchair?: DashboardWheelchair | null | any; // API/DB 호환성을 위해 any 허용
  onDeselect: () => void;
}

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
  } // 🚨 [FIX] status 객체를 any로 캐스팅하고 변수명 매핑 적용

  const status = wheelchair.status as any;
  // ⭐️ [FIX] 데이터 매핑 (SnakeCase/CamelCase 호환성 확보)
  const deviceSerial = wheelchair.device_serial || wheelchair.deviceSerial;
  const isConnected = status?.is_connected ?? status?.isConnected;
  const batteryPercent = status?.current_battery ?? status?.batteryPercent ?? 0;
  const speed = status?.current_speed ?? status?.speed ?? 0;

  // 맵핑된 데이터를 사용하지 않는 경우를 대비한 안전 장치
  if (!status) return null;

  return (
    <div className={styles.container}>
      {/* --- 제목 영역 + 닫기 버튼 --- */}
      <div className={styles.titleWrapper}>
        <h2 className={styles.title}>
          {/* 🚨 [FIX] device_serial로 통일 */}
          {wheelchair.nickname || deviceSerial || '휠체어 이름'}
        </h2>

        <button
          onClick={onDeselect}
          className={styles.closeButton}
          title="선택 해제"
        >
          &times;
        </button>
      </div>
      {/* 연결 상태 */}
      <div className={styles.connectionStatus}>
        <div
          className={`${styles.statusDot} ${
            // 🚨 [FIX] is_connected 사용
            isConnected ? styles.connected : styles.disconnected
          }`}
        />

        <span className={styles.statusText}>
          {isConnected ? '연결됨' : '연결 끊김'}
        </span>
      </div>
      {/* 상태 정보 */}
      <div className={styles.infoSection}>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>배터리:</span>
          <span className={styles.infoValue}>
            {/* 🚨 [FIX] current_battery 사용 */}
            {batteryPercent.toFixed(0)}%
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
          {/* 🚨 [FIX] current_speed 사용 */}
          <span className={styles.infoValue}>{speed.toFixed(1)} km/h</span>
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
