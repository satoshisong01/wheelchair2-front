// 경로: app/(protected)/wheelchair-info/components/DrivingInfoPanel.tsx

'use client';

import { useState, useEffect } from 'react';
import styles from '../page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';

// ⏳ 통신 두절 판단 기준 (30초)
const DISCONNECT_THRESHOLD_MS = 30 * 1000;

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

  // 3. 데이터 매핑 (끊기면 0으로 초기화할 항목들)
  // ⭐️ 연결 끊기면 0, 아니면 값 표시
  const voltage = isPowerOn ? status.voltage ?? 0 : 0;
  const current = isPowerOn ? status.current ?? 0 : 0;
  const speed = isPowerOn ? status.current_speed ?? status.speed ?? 0 : 0;

  // 4. 데이터 매핑 (끊겨도 유지할 항목들)
  const distance = status.distance ?? 0;
  const operatingTime = status.operating_time ?? status.operatingTime ?? 0;
  const postureTime = status.light ?? 0;
  const runtime = status.runtime ?? 0;

  const formatTime = (minutes: number) => {
    const num = Number(minutes);
    if (isNaN(num)) return '0 min';

    const h = Math.floor(num / 60);
    const m = Math.floor(num % 60);

    if (h > 0) return `${h} h ${m} min`;
    return `${m} min`;
  };

  const formatDecimal = (value: any) => {
    const num = Number(value);
    if (isNaN(num)) return '0.0';
    return num.toFixed(1);
  };

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
          <strong> {formatTime(runtime)}</strong>
        </p>
        <p>
          전압: <strong>{formatDecimal(voltage)} V</strong>
        </p>
        <p>
          주행 거리:
          <strong>
            {Number(distance).toLocaleString(undefined, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}
            m
          </strong>
        </p>
        <p>
          전류: <strong>{formatDecimal(current)} A</strong>
        </p>
        <p>
          속도: <strong>{formatDecimal(speed)} m/s</strong>
        </p>
        <p>
          자세유지시간: <strong>{formatTime(postureTime)}</strong>
        </p>
        <p>
          휠체어 사용 시간: <strong>{formatTime(operatingTime)}</strong>
        </p>
      </div>
    </div>
  );
};

export default DrivingInfoPanel; // default export 추가 (혹시 필요할 경우 대비)
