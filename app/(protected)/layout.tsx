// 'use client'; // [삭제됨]
// import { useEffect } from 'react'; // [삭제됨]
// import { socket } from '@/lib/socket'; // [삭제됨]
import Sidebar from '@/components/layout/Sidebar';
import styles from './layout.module.css';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // [삭제됨] Socket.IO R&D 로직 (useEffect 블록 전체)

  // 1인 개발자님의 기존 레이아웃 구조 (변경 없음)
  return (
    <div className={styles.container}>
      {/* 1. 모든 보호된 페이지의 왼쪽에 사이드바를 렌더링합니다. */}
      <Sidebar />

      {/* 2. 메인 콘텐츠 영역 (page.tsx 파일들이 여기에 렌더링됨) */}
      <main className={styles.main}>{children}</main>
    </div>
  );
}
