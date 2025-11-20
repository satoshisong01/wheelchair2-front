'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  // 관리자 권한 체크 (MASTER 또는 ADMIN)
  const isManager =
    session?.user?.role === 'ADMIN' || session?.user?.role === 'MASTER';
  const isMaster = session?.user?.role === 'MASTER';

  // 🚨 [수정] 사용자 이름 표시 로직 개선 (DB 구조 반영)
  const user = session?.user as any;
  let displayName = '사용자';

  console.log('Sidebar session@@@@@ user:', user);

  if (user) {
    // 1. 기기(DEVICE) 로그인인 경우 -> device_id 표시
    // (기기 로그인은 보통 username이나 deviceId 필드에 식별자가 담겨 있습니다)
    if (user.role === 'DEVICE') {
      displayName = user.deviceId || user.username || user.id || '기기';
    }
    // 2. 일반 회원(ADMIN, MASTER)인 경우 -> name(이름) 표시
    // (users 테이블의 name 컬럼을 최우선으로 표시)
    else {
      displayName = user.name || user.username || user.email || '관리자';
    }
  }

  return (
    <nav className={styles.sidebar}>
      {/* 1. 상단 로고 */}
      <div className={styles.logo}>
        <Link href="/dashboard">FIRST C&D</Link>
      </div>

      {/* 2. 탭 리스트 */}
      <ul className={styles.navList}>
        {/* 대시보드 (관리자용) */}
        {isManager && (
          <li className={pathname === '/dashboard' ? styles.active : ''}>
            <Link href="/dashboard">
              <span>📊</span> 대시보드
            </Link>
          </li>
        )}

        {/* 휠체어 정보 (공통) */}
        <li
          className={
            pathname.startsWith('/wheelchair-info') ? styles.active : ''
          }
        >
          <Link href="/wheelchair-info">
            <span>♿</span> 휠체어 정보
          </Link>
        </li>

        {/* 통계 그래프 (공통) */}
        <li className={pathname.startsWith('/stats') ? styles.active : ''}>
          <Link href="/stats">
            <span>📈</span> 통계 그래프
          </Link>
        </li>

        {/* 기기 관리 (관리자용) */}
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

        {/* 회원 관리 (MASTER 전용) */}
        {isMaster && (
          <li className={pathname === '/user-management' ? styles.active : ''}>
            <Link href="/user-management">
              <span>👥</span> 회원 관리
            </Link>
          </li>
        )}

        {/* 감사 로그 (MASTER 전용) */}
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

        {/* 로그아웃 시 메인 페이지(/)로 이동 */}
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className={styles.logoutButton}
        >
          <span>🚪</span> Logout
        </button>
      </div>

      <div className={styles.spacer}></div>
    </nav>
  );
}
