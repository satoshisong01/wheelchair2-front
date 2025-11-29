// app/(protected)/wheelchair-info/components/PostureControlPanel.tsx
'use client';

import styles from '../page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';
import Image from 'next/image';

// 4. PostureItem (기존 디자인 유지)
const PostureItem = ({
  title,
  value,
  max,
  timestamp,
  imageUrl,
}: {
  title: string;
  value: string;
  max: string;
  timestamp: string;
  imageUrl?: string;
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
          />
        </div>
      )}
      <div className={styles.postureGauge}>
        <p className={styles.currentValue}>{value}°</p>
        <p className={styles.maxValue}>Max {max}°</p>
        <p className={styles.postureTimestamp}>{timestamp}</p>
      </div>
    </div>
  </div>
);

// 5. PostureControlPanel (데이터 연결 수정됨)
export const PostureControlPanel = ({
  wc,
}: {
  wc: DashboardWheelchair | any; // ⭐️ any를 허용해서 snake_case 접근 가능하게 함
}) => {
  const status = wc?.status || {};

  // ⭐️ [핵심 수정] DB(snake_case)와 기존(camelCase) 변수명을 모두 체크
  // 값이 없으면 0으로 처리
  const valSeat = status.angle_seat ?? status.angleSeat ?? 0;
  const valBack = status.angle_back ?? status.angleBack ?? 0;
  const valIncline = status.incline_angle ?? status.inclineAngle ?? 0;
  const valFoot = status.foot_angle ?? status.footAngle ?? 0;

  // 시간 포맷팅 (실제 데이터 시간 사용)
  const lastTime = status.last_seen
    ? new Date(status.last_seen).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'N/A';

  // 날짜 포맷팅
  const lastDate = status.last_seen
    ? new Date(status.last_seen).toLocaleDateString()
    : 'N/A';

  const displayTime = `${lastDate} ${lastTime}`;

  return (
    <div className={`${styles.card} ${styles.postureCard}`}>
      <h2 className={styles.sectionTitle}>자세 조절</h2>
      <div className={styles.postureGrid}>
        {/* 높이 조절 (좌석 각도) */}
        <PostureItem
          title="높이 조절"
          imageUrl="/icons/secondtab/elevation-adjustment.svg"
          value={valSeat.toFixed(1)}
          max="100"
          timestamp={displayTime}
        />

        {/* 등받이 조절 */}
        <PostureItem
          title="등받이 조절"
          imageUrl="/icons/secondtab/recline-height.svg"
          value={valBack.toFixed(1)}
          max="30"
          timestamp={displayTime}
        />

        {/* 기울기 조절 */}
        <PostureItem
          title="기울기 조절"
          imageUrl="/icons/secondtab/tilt-adjustment.svg"
          value={valIncline.toFixed(1)}
          max="25"
          timestamp={displayTime}
        />

        {/* 발판 조절 */}
        <PostureItem
          title="발판 조절"
          imageUrl="/icons/secondtab/footrest-adjustment.svg"
          value={valFoot.toFixed(1)}
          max="10"
          timestamp={displayTime}
        />
      </div>
    </div>
  );
};
