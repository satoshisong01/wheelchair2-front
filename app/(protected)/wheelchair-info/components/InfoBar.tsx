'use client';

import { useSession } from 'next-auth/react';
import styles from '../page.module.css'; // 부모 CSS 모듈 사용
import { DashboardWheelchair } from '@/types/wheelchair';
import { fmtUnit } from '@/lib/format';

interface InfoBarProps {
  // 🚨 [FIX] API 호환성을 위해 any 허용
  wc: DashboardWheelchair | null | any;
  allWheelchairs?: DashboardWheelchair[];
  onSelectWheelchair?: (id: string) => void;
  disableDropdown?: boolean;
}

export const InfoBar = ({
  wc,
  allWheelchairs = [],
  onSelectWheelchair,
  disableDropdown = false,
}: InfoBarProps) => {
  const { data: session } = useSession();
  // @ts-ignore
  const userRole = (session?.user?.role as string) || '';

  // 관리자 여부 (드롭다운 표시용)
  const isManager = userRole === 'ADMIN' || userRole === 'MASTER';

  // 기기 로그인 여부 확인 (검색창 숨김용)
  const isDevice = userRole === 'DEVICE' || userRole === 'DEVICE_USER';

  // ⭐️ [FIX] wc에서 model_name과 device_serial을 사용합니다. (타입 에러 방지)
  const currentWc = wc as any;
  // 🚨 [FIX] modelName 대신 model_name 사용
  const currentModelName =
    currentWc?.model_name || currentWc?.modelName || 'N/A';
  const currentDeviceSerial =
    currentWc?.device_serial || currentWc?.deviceSerial || 'N/A';
  const status = currentWc?.status || {};

  return (
    <div className={styles.infoBar}>
      <div className={styles.infoBarLeft}>
        {/* 1. 관리자일 경우: 드롭다운으로 휠체어 선택 */}
        {isManager && onSelectWheelchair ? (
          <div className={styles.adminSelector}>
            <span style={{ color: 'white' }}>차량 선택:</span>
            <select
              className={styles.selectControl}
              value={currentWc?.id || ''}
              onChange={(e) => onSelectWheelchair(e.target.value)}
              disabled={disableDropdown}
              style={{
                opacity: disableDropdown ? 0.6 : 1,
                cursor: disableDropdown ? 'not-allowed' : 'pointer',
              }}
            >
              {allWheelchairs.length === 0 && (
                <option>등록된 휠체어 없음</option>
              )}
              {allWheelchairs.map((item) => (
                <option key={item.id} value={item.id}>
                  {/* 🚨 [FIX] item.device_serial 및 item.model_name 사용 */}
                  {(item as any).device_serial}
                </option>
              ))}
            </select>
          </div>
        ) : (
          /* 2. 일반 사용자(기기 포함)일 경우: 텍스트로 차량명만 표시 */
          <span className={styles.infoItem}>
            {/* 🚨 [FIX] currentDeviceSerial 사용 */}
            차량명: <strong>{currentDeviceSerial}</strong>
          </span>
        )}

        {/* 공통 정보 표시 */}
        <span className={styles.infoItem}>
          {/* 🚨 [FIX] currentModelName 사용 */}
          모델명: <strong>{currentModelName}</strong>
        </span>

        {/* 환경 정보 (Worker가 데이터를 보내주면 표시됨, 없으면 '-') */}
        <span className={styles.infoItem}>
          온도: <strong>{fmtUnit(status.temperature, '°C', 1)}</strong>
        </span>
        <span className={styles.infoItem}>
          습도: <strong>{fmtUnit(status.humidity, '%', 1)}</strong>
        </span>
        <span className={styles.infoItem}>
          기압: <strong>{fmtUnit(status.pressure, 'hPa', 1)}</strong>
        </span>
      </div>

      {/* 기기 로그인(isDevice)이 아닐 때만 검색창 표시 (기존 유지) */}
      {!isDevice && (
        <div className={styles.infoBarRight}>
          <input
            type="text"
            placeholder="Search..."
            className={styles.searchInput}
          />
          <button className={styles.searchButton}>🔍</button>
        </div>
      )}
    </div>
  );
};
