// app/(protected)/_components/Sidebar/Sidebar.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  if (status === 'loading') {
    return (
      <nav className={styles.sidebar}>
        <div className={styles.logo}>Loading...</div>
      </nav>
    );
  }

  // --------------------------------------------------------
  // 권한 체크
  // --------------------------------------------------------
  const isManager = session?.user?.role === 'ADMIN' || session?.user?.role === 'MASTER';
  const isMaster = session?.user?.role === 'MASTER';
  const isDeviceUser = session?.user?.role === 'DEVICE_USER';

  const user = session?.user as any;
  let displayName = '사용자';

  if (user) {
    if (isManager) {
      const name = user.name || user.nickname || user.email || '관리자';
      let roleName = '관리자';
      if (user.role === 'MASTER') roleName = '마스터 관리자';
      else if (user.role === 'ADMIN') roleName = '관리자';
      else roleName = user.role;
      displayName = `[${name}] ${roleName}`;
    } else if (isDeviceUser || user.role === 'DEVICE') {
      displayName = user.device_id || user.deviceId || user.username || user.id || '기기';
    } else {
      displayName = user.nickname || user.name || user.email || '일반 사용자';
    }
  }

  const handleLogout = async () => {
    if (!confirm('정말 로그아웃 하시겠습니까?')) return;
    try {
      localStorage.clear();
      sessionStorage.clear();
      await signOut({ callbackUrl: '/', redirect: true });
    } catch (error) {
      console.error('Logout failed', error);
      window.location.href = '/';
    }
  };

  return (
    <nav className={styles.sidebar}>
      {/* 1. 상단 로고 */}
      <div className={styles.logo}>
        <Link href={isDeviceUser ? '/mobile-view' : isManager ? '/dashboard' : '/wheelchair-info'}>
          {/* 🟢 [수정] 텍스트 대신 로고 이미지 사용 */}
          <Image
            src="/logo.png"
            alt="FIRST C&D"
            width={140} // 사이드바 너비에 맞춰 조절
            height={40}
            style={{ objectFit: 'contain' }}
            priority
          />
        </Link>
      </div>

      {/* 2. 탭 리스트 */}
      <ul className={styles.navList}>
        {/* 🤖 [수정] 기기 사용자용 메뉴 (홈 버튼 추가) */}
        {isDeviceUser && (
          <li className={pathname === '/mobile-view' ? styles.active : ''}>
            <Link href="/mobile-view">
              <span>🏠</span> 홈
            </Link>
          </li>
        )}

        {/* 🖥️ [수정] 관리자 전용 메뉴들 (기기 사용자가 아닐 때만 보임) */}
        {!isDeviceUser && (
          <>
            {isManager && (
              <li className={pathname === '/dashboard' ? styles.active : ''}>
                <Link href="/dashboard">
                  <span>📊</span> 대시보드
                </Link>
              </li>
            )}

            <li className={pathname.startsWith('/wheelchair-info') ? styles.active : ''}>
              <Link href="/wheelchair-info">
                <span>♿</span> 휠체어 정보
              </Link>
            </li>

            <li className={pathname.startsWith('/stats') ? styles.active : ''}>
              <Link href="/stats">
                <span>📈</span> 분석
              </Link>
            </li>

            {isManager && (
              <li className={pathname.startsWith('/device-management') ? styles.active : ''}>
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
                  <span>📑</span> 관리
                </Link>
              </li>
            )}

            {isManager && (
              <li className={pathname === '/ulcer-alerts' ? styles.active : ''}>
                <Link href="/ulcer-alerts">
                  <span>🩹</span> 욕창알림 내역
                </Link>
              </li>
            )}
          </>
        )}
      </ul>

      {/* 3. 하단 (프로필 + 로그아웃) */}

      {/* 마이페이지 링크 (모두에게 보임) */}
      <Link
        href="/mypage"
        className={styles.mypageLink}
        style={{
          display: 'block',
          textAlign: 'center',
          margin: '10px 0',
          color: '#111',
          fontSize: '13px',
          textDecoration: 'none',
        }}
      >
        ⚙️ 마이페이지
      </Link>

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
