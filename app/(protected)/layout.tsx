// 'use client'; // [삭제됨]
// import { useEffect } from 'react'; // [삭제됨]
// import { socket } from '@/lib/socket'; // [삭제됨]
import Sidebar from '@/components/layout/Sidebar';
import styles from './layout.module.css';
import MobileHeader from '../../components/layout/MobileHeader';
import BottomNavigation from '../../components/layout/BottomNavigation';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.container}>
      {/* 1. PC용 사이드바 (기존 유지) */}
      <div className={styles.sidebarWrapper}>
        <Sidebar />
      </div>

      {/* 2. 모바일용 헤더/바텀바 (신규 추가 - CSS로 제어) */}
      <div className={styles.mobileOnly}>
        <MobileHeader />
        <BottomNavigation />
      </div>

      {/* 3. 메인 콘텐츠 */}
      <main className={styles.main}>{children}</main>
    </div>
  );
}
