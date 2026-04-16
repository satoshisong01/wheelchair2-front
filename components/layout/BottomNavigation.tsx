// components/layout/BottomNavigation.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import styles from './BottomNavigation.module.css';

export default function BottomNavigation() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userRole = session?.user?.role;

  // 권한 체크
  const isManager = userRole === 'ADMIN' || userRole === 'MASTER';
  const isMaster = userRole === 'MASTER';

  return (
    <nav className={styles.bottomNav}>
      {/* 1. 대시보드 (Admin, Master) */}
      {isManager && (
        <Link
          href="/dashboard"
          className={`${styles.navItem} ${pathname === '/dashboard' ? styles.active : ''}`}
        >
          <span className={styles.icon}>📊</span>
          <span className={styles.label}>대시보드</span>
        </Link>
      )}

      {/* 2. 휠체어 정보 (모두) -> 일반 사용자는 '홈'으로 크게 표시 */}
      <Link
        href={isManager ? '/wheelchair-info' : '/mobile-view'}
        className={`${isManager ? styles.navItem : styles.navItemHome} ${
          (isManager ? pathname.startsWith('/wheelchair-info') : pathname.startsWith('/mobile-view')) ? styles.active : ''
        }`}
      >
        <span className={isManager ? styles.icon : styles.iconHome}>{isManager ? '♿' : '🏠'}</span>
        <span className={isManager ? styles.label : styles.labelHome}>{isManager ? '정보' : '홈'}</span>
      </Link>

      {/* 3. 통계 그래프 (관리자 전용으로 변경) */}
      {isManager && (
        <Link
          href="/stats"
          className={`${styles.navItem} ${pathname.startsWith('/stats') ? styles.active : ''}`}
        >
          <span className={styles.icon}>📈</span>
          <span className={styles.label}>통계</span>
        </Link>
      )}

      {/* 4. 기기 관리 (Admin, Master) */}
      {isManager && (
        <Link
          href="/device-management"
          className={`${styles.navItem} ${
            pathname.startsWith('/device-management') ? styles.active : ''
          }`}
        >
          <span className={styles.icon}>🛠️</span>
          <span className={styles.label}>기기관리</span>
        </Link>
      )}

      {/* 5. 회원 관리 (Master) */}
      {isMaster && (
        <Link
          href="/user-management"
          className={`${styles.navItem} ${pathname === '/user-management' ? styles.active : ''}`}
        >
          <span className={styles.icon}>👥</span>
          <span className={styles.label}>회원관리</span>
        </Link>
      )}

      {/* 6. 감사 로그 (Master) */}
      {isMaster && (
        <Link
          href="/audit-log"
          className={`${styles.navItem} ${pathname === '/audit-log' ? styles.active : ''}`}
        >
          <span className={styles.icon}>📑</span>
          <span className={styles.label}>감사로그</span>
        </Link>
      )}

      {/* 7. 욕창알림 내역 (Admin, Master) */}
      {isManager && (
        <Link
          href="/ulcer-alerts"
          className={`${styles.navItem} ${pathname === '/ulcer-alerts' ? styles.active : ''}`}
        >
          <span className={styles.icon}>🩹</span>
          <span className={styles.label}>욕창알림</span>
        </Link>
      )}
    </nav>
  );
}
