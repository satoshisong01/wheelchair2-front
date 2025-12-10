import styles from './LoadingSpinner.module.css';
import React from 'react';
import { ReactNode } from 'react'; // ReactNode 타입을 임포트

interface LoadingSpinnerProps {
  text?: string;
  // 또는 children을 사용해 텍스트 노드를 받을 수도 있습니다.
  // children?: ReactNode;
}

export default function LoadingSpinner({ text }: LoadingSpinnerProps) {
  // ⭐️ [수정] text prop이 전달되면 그 값을 사용하고, 없으면 기본값('데이터를 불러오는 중입니다...')을 사용합니다.
  const defaultText = text || '데이터를 불러오는 중입니다...';

  return (
    <div className={styles.container}>
      <div className={styles.spinner} />
      <p className={styles.text}>{defaultText}</p>
    </div>
  );
}
