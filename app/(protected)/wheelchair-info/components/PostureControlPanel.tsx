// app/(protected)/wheelchair-info/components/PostureControlPanel.tsx
'use client';

import styles from '../page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';
import Image from 'next/image';

// 4. PostureItem (자세 조절 항목 - 작은 카드)
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

// 5. PostureControlPanel (자세 조절 - 오른쪽 상단)
export const PostureControlPanel = ({
  wc,
}: {
  wc: DashboardWheelchair | null;
}) => {
  const lastSeen = wc?.status?.lastSeen
    ? new Date(wc.status.lastSeen).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'N/A';
  return (
    <div className={`${styles.card} ${styles.postureCard}`}>
      <h2 className={styles.sectionTitle}>자세 조절</h2>{' '}
      <div className={styles.postureGrid}>
        {' '}
        <PostureItem
          title="높이 조절"
          imageUrl="/icons/secondtab/elevation-adjustment.svg"
          value={wc?.status?.angleSeat?.toFixed(1) || '0'} // 👈 angle_seat -> angleSeat 수정
          max="100"
          timestamp={`2025/11/07 ${lastSeen}`}
        />{' '}
        <PostureItem
          title="등받이 조절"
          imageUrl="/icons/secondtab/recline-height.svg"
          value={wc?.status?.angleBack?.toFixed(1) || '0'} // 👈 angle_back -> angleBack 수정
          max="30"
          timestamp={`2025/11/07 ${lastSeen}`}
        />{' '}
        <PostureItem
          title="기울기 조절"
          imageUrl="/icons/secondtab/tilt-adjustment.svg"
          value={wc?.status?.inclineAngle?.toFixed(1) || '0'} // (이미 CamelCase로 잘 작동 중)
          max="25"
          timestamp={`2025/11/07 ${lastSeen}`}
        />{' '}
        <PostureItem
          title="발판 조절"
          imageUrl="/icons/secondtab/footrest-adjustment.svg"
          value={wc?.status?.footAngle?.toFixed(1) || '0'} // 👈 foot_angle -> footAngle 수정
          max="10"
          timestamp={`2025/11/07 ${lastSeen}`}
        />{' '}
      </div>{' '}
    </div>
  );
};
