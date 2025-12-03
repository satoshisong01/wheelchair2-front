// 경로: app/(protected)/wheelchair-info/components/DrivingInfoPanel.tsx
// 📝 설명: isConnected -> is_connected 변수명 매핑 수정 (타입 에러 해결)

'use client';

import styles from '../page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';

export const DrivingInfoPanel = ({
  wc,
}: {
  wc: DashboardWheelchair | null;
}) => {
  // ⭐️ [핵심 수정] 타입을 any로 단언하여 snake_case 속성 접근 허용
  const status = (wc?.status || {}) as any;

  // DB/API는 'is_connected'로 보내줍니다.
  const isPowerOn = status.is_connected ?? status.isConnected ?? false;

  // 나머지 데이터 매핑
  const voltage = status.voltage ?? 0;
  const current = status.current ?? 0;
  const speed = status.current_speed ?? status.speed ?? 0;
  const distance = status.distance ?? 0;
  const operatingTime = status.operating_time ?? status.operatingTime ?? 0;
  const postureTime = status.light ?? 0;

  // (추가 데이터가 없다면 0 또는 기본값 처리)
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
    return num.toFixed(1); // 항상 문자열 "x.x" 형태 반환
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.sectionTitle}>운행 정보</h3>
      <div className={styles.drivingGrid}>
        <p>
          전원:{' '}
          <strong style={{ color: isPowerOn ? '#28a745' : '#dc3545' }}>
            {isPowerOn ? 'ON' : 'OFF'}
          </strong>
        </p>
        <p>
          {/* 주행 시간은 분 단위로 온다고 가정하고 시간/분 변환 */}
          주행 시간:{' '}
          <strong>
            주행 시간: <strong>{formatTime(runtime)}</strong>
          </strong>
        </p>
        <p>
          전압: <strong>{formatDecimal(voltage)} V</strong>
        </p>
        <p>
          주행 거리:{' '}
          <strong>
            {Number(distance).toLocaleString(undefined, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}{' '}
            m
          </strong>
        </p>
        <p>
          전류: <strong>{formatDecimal(current)} A</strong>
        </p>
        <p>
          속도: <strong>{formatDecimal(speed)} m/s</strong>
        </p>
        {/* 아래 두 항목은 DB에 컬럼이 없으면 하드코딩 유지하거나 0 처리 */}
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
