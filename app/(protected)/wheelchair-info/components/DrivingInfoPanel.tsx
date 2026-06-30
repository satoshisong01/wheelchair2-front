// 경로: app/(protected)/wheelchair-info/components/DrivingInfoPanel.tsx

'use client';

import { useState, useEffect } from 'react';
import styles from '../page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';
import { fmtUnit, fmtMinutes, fmtDist } from '@/lib/format';

// ⏳ 통신 두절 판단 기준 (60초)
const DISCONNECT_THRESHOLD_MS = 60 * 1000;

export const DrivingInfoPanel = ({ wc }: { wc: DashboardWheelchair | null }) => {
  const [isDataFresh, setIsDataFresh] = useState(true);

  // ⭐️ [핵심] 타입을 any로 단언하여 snake_case 속성 접근 허용
  const status = (wc?.status || {}) as any;
  const lastSeen = status.last_seen;

  // 1. 데이터 신선도 체크 (1초마다 실행)
  useEffect(() => {
    const checkFreshness = () => {
      if (!lastSeen) {
        setIsDataFresh(false);
        return;
      }

      const diff = Date.now() - new Date(lastSeen).getTime();
      // 30초 이상 차이나면 '죽은 데이터'로 판단
      setIsDataFresh(diff < DISCONNECT_THRESHOLD_MS);
    };

    checkFreshness(); // 초기 실행
    const timer = setInterval(checkFreshness, 1000); // 주기적 실행

    return () => clearInterval(timer);
  }, [lastSeen]);

  // 2. 실제 연결 상태 판단 (데이터가 신선해야 진짜 ON)
  // DB상 connected여도, 30초간 통신 없으면 OFF로 간주
  const isConnectedRaw = status.is_connected ?? status.isConnected ?? false;
  const isPowerOn = isDataFresh && isConnectedRaw;

  // 3. 데이터 매핑 (끊기면 '-' 표시할 실시간 항목들)
  // ⭐️ 연결 끊기면 데이터 없음(null)→'-', 아니면 실측값(실제 0 포함)을 표시
  const voltage = isPowerOn ? status.voltage : null;
  const current = isPowerOn ? status.current : null;
  const speed = isPowerOn ? status.current_speed ?? status.speed : null;

  // 4. 데이터 매핑 (끊겨도 유지하는 누적 항목들, 값 없으면 '-')
  const distance = status.distance;
  const operatingTime = status.operating_time ?? status.operatingTime;
  const postureTime = status.posture_time ?? status.postureTime;
  const runtime = status.runtime;

  return (
    <div className={styles.card}>
      <h3 className={styles.sectionTitle}>운행 정보</h3>
      <div className={styles.drivingGrid}>
        <p>
          전원:
          <strong style={{ color: isPowerOn ? '#28a745' : '#dc3545' }}>
            {isPowerOn ? 'ON' : 'OFF'}
          </strong>
        </p>
        <p>
          주행 시간:
          <strong> {fmtMinutes(runtime)}</strong>
        </p>
        <p>
          전압: <strong>{fmtUnit(voltage, ' V', 1)}</strong>
        </p>
        <p>
          주행 거리:
          <strong>{fmtDist(distance, ' m', 1)}</strong>
        </p>
        <p>
          전류: <strong>{fmtUnit(current, ' A', 1)}</strong>
        </p>
        <p>
          속도: <strong>{fmtUnit(speed, ' m/s', 1)}</strong>
        </p>
        <p>
          자세유지시간: <strong>{fmtMinutes(postureTime)}</strong>
        </p>
        <p>
          휠체어 사용 시간: <strong>{fmtMinutes(operatingTime)}</strong>
        </p>
      </div>
    </div>
  );
};

export default DrivingInfoPanel; // default export 추가 (혹시 필요할 경우 대비)
