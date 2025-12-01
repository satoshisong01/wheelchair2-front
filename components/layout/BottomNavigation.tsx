'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './BottomNavigation.module.css'; // 아래 CSS 생성 필요

export default function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className={styles.bottomNav}>
      <Link
        href="/dashboard"
        className={`${styles.navItem} ${
          pathname === '/dashboard' ? styles.active : ''
        }`}
      >
        <span className={styles.icon}>📊</span>
        <span className={styles.label}>대시보드</span>
      </Link>

      <Link
        href="/wheelchair-info"
        className={`${styles.navItem} ${
          pathname.startsWith('/wheelchair-info') ? styles.active : ''
        }`}
      >
        <span className={styles.icon}>♿</span>
        <span className={styles.label}>휠체어 정보</span>
      </Link>

      <Link
        href="/stats"
        className={`${styles.navItem} ${
          pathname.startsWith('/stats') ? styles.active : ''
        }`}
      >
        <span className={styles.icon}>📈</span>
        <span className={styles.label}>통계그래프</span>
      </Link>

      <Link
        href="/user-management"
        className={`${styles.navItem} ${
          pathname === '/user-management' ? styles.active : ''
        }`}
      >
        <span className={styles.icon}>👤</span>
        <span className={styles.label}>회원관리</span>
      </Link>
    </nav>
  );
}
