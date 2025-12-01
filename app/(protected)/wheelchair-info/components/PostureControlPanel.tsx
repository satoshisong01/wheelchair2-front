'use client';

import styles from '../page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';
import Image from 'next/image';

// 4. PostureItem (단위 unit 추가)
const PostureItem = ({
  title,
  value,
  max,
  timestamp,
  imageUrl,
  unit = '°', // 기본값은 도(degree)
}: {
  title: string;
  value: string;
  max: string;
  timestamp: string;
  imageUrl?: string;
  unit?: string;
}) => (
  <div className={styles.postureItem}>
    <p className={styles.postureTitle}>{title}</p>
    <div className={styles.postureBox}>
      {imageUrl && (
        <div className={styles.postureImageWrapper}>
          <Image
            src={imageUrl}
            alt={title}
            fill={true}
            sizes="(max-width: 768px) 10vw, 50px"
            priority
            style={{ objectFit: 'contain' }}
          />
        </div>
      )}
      <div className={styles.postureGauge}>
        {/* ⭐️ 값과 단위(unit)를 함께 표시 */}
        <p className={styles.currentValue}>
          {value}
          {unit}
        </p>
        <p className={styles.maxValue}>
          Max {max}
          {unit}
        </p>
        <p className={styles.postureTimestamp}>{timestamp}</p>
      </div>
    </div>
  </div>
);

// 5. PostureControlPanel (최신 데이터 매핑 적용)
export const PostureControlPanel = ({
  wc,
}: {
  wc: DashboardWheelchair | any;
}) => {
  const status = wc?.status || {};

  // ⭐️ [데이터 매핑] DB 컬럼명(snake_case)과 소켓 데이터 매칭
  // 1. 등받이 & 시트
  const valBack = status.angle_back ?? status.angleBack ?? 0;
  const valSeat = status.angle_seat ?? status.angleSeat ?? 0; // 시트(기울기)

  // 2. 발판 & 높이
  const valFoot = status.foot_angle ?? status.footAngle ?? 0;
  const valElev = status.elevation_dist ?? status.elevationDist ?? 0; // 높이 (신규)

  // 3. 경사도 (신규)
  const valSlopeFr = status.slope_fr ?? status.slopeFr ?? 0; // 전후방
  const valSlopeSide = status.slope_side ?? status.slopeSide ?? 0; // 측면

  // 시간 포맷팅
  const lastTime = status.last_seen
    ? new Date(status.last_seen).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'N/A';

  const lastDate = status.last_seen
    ? new Date(status.last_seen).toLocaleDateString()
    : 'N/A';

  const displayTime = `${lastDate} ${lastTime}`;

  return (
    <div className={`${styles.card} ${styles.postureCard}`}>
      <h2 className={styles.sectionTitle}>자세 조절</h2>

      {/* 2x3 그리드 배치 (CSS는 기존 grid-template-columns: 1fr 1fr; 유지) */}
      <div className={styles.postureGrid}>
        {/* Row 1: 등받이, 시트(기울기) */}
        <PostureItem
          title="등받이 조절"
          imageUrl="/icons/secondtab/recline-height.svg"
          value={Number(valBack).toFixed(1)}
          max="180"
          unit="°"
          timestamp={displayTime}
        />
        <PostureItem
          title="시트 조절"
          imageUrl="/icons/secondtab/tilt-adjustment.svg"
          value={Number(valSeat).toFixed(1)}
          max="45"
          unit="°"
          timestamp={displayTime}
        />

        {/* Row 2: 발판, 높이 */}
        <PostureItem
          title="발판 조절"
          imageUrl="/icons/secondtab/footrest-adjustment.svg"
          value={Number(valFoot).toFixed(1)}
          max="90"
          unit="°"
          timestamp={displayTime}
        />
        <PostureItem
          title="높이 조절"
          imageUrl="/icons/secondtab/elevation-adjustment.svg"
          value={Number(valElev).toFixed(1)}
          max="30"
          unit="cm"
          timestamp={displayTime}
        />

        {/* Row 3: 전후방 경사, 측면 경사 */}
        <PostureItem
          title="전후방 경사"
          imageUrl="/icons/secondtab/tilt-adjustment.svg" // 아이콘 적절한 걸로 변경 권장
          value={Number(valSlopeFr).toFixed(1)}
          max="20"
          unit="°"
          timestamp={displayTime}
        />
        <PostureItem
          title="측면 경사"
          imageUrl="/icons/secondtab/tilt-adjustment.svg" // 아이콘 적절한 걸로 변경 권장
          value={Number(valSlopeSide).toFixed(1)}
          max="20"
          unit="°"
          timestamp={displayTime}
        />
      </div>
    </div>
  );
};
