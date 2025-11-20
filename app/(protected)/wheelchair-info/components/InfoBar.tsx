'use client';

import { useSession } from 'next-auth/react';
import styles from '../page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';

interface InfoBarProps {
  wc: DashboardWheelchair | null;
  allWheelchairs?: DashboardWheelchair[]; // 관리자용 전체 목록
  onSelectWheelchair?: (id: number) => void; // 선택 핸들러
  disableDropdown?: boolean;
}

export const InfoBar = ({
  wc,
  allWheelchairs = [],
  onSelectWheelchair,
  disableDropdown = false,
}: InfoBarProps) => {
  const { data: session } = useSession();
  const userRole = (session?.user?.role as string) || '';

  // 관리자 여부 (드롭다운 표시용)
  const isManager = userRole === 'ADMIN' || userRole === 'MASTER';

  // 기기 로그인 여부 확인 (검색창 숨김용)
  // DEVICE_USER도 기기 사용자로 인식
  const isDevice = userRole === 'DEVICE' || userRole === 'DEVICE_USER';

  return (
    <div className={styles.infoBar}>
      <div className={styles.infoBarLeft}>
        {/* 1. 관리자일 경우: 드롭다운으로 휠체어 선택 */}
        {isManager && onSelectWheelchair ? (
          <div className={styles.adminSelector}>
            <span>차량 선택:</span>
            <select
              className={styles.selectControl}
              value={wc?.id || ''}
              onChange={(e) => onSelectWheelchair(Number(e.target.value))}
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
                  {item.deviceSerial} ({item.modelName})
                </option>
              ))}
            </select>
          </div>
        ) : (
          /* 2. 일반 사용자(기기 포함)일 경우: 텍스트로 차량명만 표시 */
          <span className={styles.infoItem}>
            차량명: <strong>{wc?.deviceSerial || 'N/A'}</strong>
          </span>
        )}

        {/* 공통 정보 표시 */}
        <span className={styles.infoItem}>
          모델명: <strong>{wc?.modelName || 'N/A'}</strong>
        </span>

        {/* [삭제됨] 사용자 정보 표시는 요청하신 대로 완전히 제거했습니다. */}

        <span className={styles.infoItem}>
          온도: <strong>{wc?.status?.temperature?.toFixed(1) || 0}°C</strong>
        </span>
        <span className={styles.infoItem}>
          습도: <strong>{wc?.status?.humidity?.toFixed(1) || 0}%</strong>
        </span>
        <span className={styles.infoItem}>
          기압: <strong>{wc?.status?.pressure?.toFixed(1) || 1026}hPa</strong>
        </span>
      </div>

      {/* 기기 로그인(isDevice)이 아닐 때만 검색창 표시 (기기는 검색 불필요) */}
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
