'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  // ⭐️ [FIX 1] 로딩 중일 때 '사용자' 화면이 깜빡이는 현상 방지
  // 세션 정보를 불러오는 중이면 사이드바 내용이나 전체를 숨깁니다.
  if (status === 'loading') {
    return (
      <nav className={styles.sidebar}>
        <div className={styles.logo}>Loading...</div>
      </nav>
    );
  }

  // --------------------------------------------------------
  // 권한 체크 및 표시 이름 설정
  // --------------------------------------------------------
  const isManager =
    session?.user?.role === 'ADMIN' || session?.user?.role === 'MASTER';
  const isMaster = session?.user?.role === 'MASTER';

  const user = session?.user as any;
  let displayName = '사용자';

  if (user) {
    if (user.role === 'DEVICE' || user.role === 'DEVICE_USER') {
      displayName = user.deviceId || user.username || user.id || '기기';
    } else {
      displayName =
        user.nickname || user.name || user.username || user.email || '관리자';
    }
  }

  // ⭐️ [FIX 2] 강력한 커스텀 로그아웃
  const handleLogout = async () => {
    try {
      // 1. 우리가 만든 쿠키 삭제 API 호출
      await fetch('/api/logout', { method: 'POST' });

      // 2. 클라이언트 스토리지 청소
      localStorage.clear();
      sessionStorage.clear();

      // 3. 페이지 완전 새로고침하며 이동 (캐시 무시)
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed', error);
      window.location.href = '/';
    }
  };

  return (
    <nav className={styles.sidebar}>
      {/* 1. 상단 로고 */}
      <div className={styles.logo}>
        <Link href={isManager ? '/dashboard' : '/wheelchair-info'}>
          FIRST C&D
        </Link>
      </div>

      {/* 2. 탭 리스트 */}
      <ul className={styles.navList}>
        {isManager && (
          <li className={pathname === '/dashboard' ? styles.active : ''}>
            <Link href="/dashboard">
              <span>📊</span> 대시보드
            </Link>
          </li>
        )}

        <li
          className={
            pathname.startsWith('/wheelchair-info') ? styles.active : ''
          }
        >
          <Link href="/wheelchair-info">
            <span>♿</span> 휠체어 정보
          </Link>
        </li>

        <li className={pathname.startsWith('/stats') ? styles.active : ''}>
          <Link href="/stats">
            <span>📈</span> 통계 그래프
          </Link>
        </li>

        {isManager && (
          <li
            className={
              pathname.startsWith('/device-management') ? styles.active : ''
            }
          >
            <Link href="/device-management">
              <span>🛠️</span> 기기 관리
            </Link>
          </li>
        )}

        {isMaster && (
          <li className={pathname === '/user-management' ? styles.active : ''}>
            <Link href="/user-management">
              <span>👥</span> 회원 관리
            </Link>
          </li>
        )}

        {isMaster && (
          <li className={pathname === '/audit-log' ? styles.active : ''}>
            <Link href="/audit-log">
              <span>📑</span> 감사 로그
            </Link>
          </li>
        )}
      </ul>

      {/* 3. 하단 (프로필 + 로그아웃) */}
      <div className={styles.footer}>
        <div className={styles.profile}>
          <div className={styles.profileIcon}>👤</div>
          <span className={styles.profileName}>{displayName}</span>
        </div>

        <button onClick={handleLogout} className={styles.logoutButton}>
          <span>🚪</span> Logout
        </button>
      </div>

      <div className={styles.spacer}></div>
    </nav>
  );
}
