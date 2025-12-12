// app/(protected)/_components/Sidebar/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react'; // ⭐️ signOut 추가
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  // 로딩 중일 때 깜빡임 방지
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
  const isDeviceUser = session?.user?.role === 'DEVICE_USER';

  const user = session?.user as any;
  let displayName = '사용자';

  if (user) {
    if (isManager) {
      // ⭐️ [핵심 수정 1] 관리자(ADMIN/MASTER)인 경우
      const name = user.name || user.nickname || user.email || '관리자';
      let roleName = '관리자';
      if (user.role === 'MASTER') {
        roleName = '마스터 관리자';
      } else if (user.role === 'ADMIN') {
        roleName = '관리자';
      } else {
        // 혹시 모를 경우를 대비해 role 값을 그대로 표시
        roleName = user.role;
      }

      displayName = `[${name}] ${roleName}`;
    } else if (isDeviceUser || user.role === 'DEVICE') {
      // ⭐️ [핵심 수정 2] 기기 사용자인 경우
      displayName =
        user.device_id || user.deviceId || user.username || user.id || '기기';
    } else {
      // 기타 역할 (예: GUEST)
      displayName = user.nickname || user.name || user.email || '일반 사용자';
    }
  }

  // ⭐️ [수정] Next-Auth 공식 로그아웃 함수 사용
  const handleLogout = async () => {
    if (!confirm('정말 로그아웃 하시겠습니까?')) return;

    try {
      // 1. 클라이언트 스토리지 청소 (유지)
      localStorage.clear();
      sessionStorage.clear();

      // 2. [핵심] Next-Auth 공식 로그아웃 (서버/로컬 모두 작동)
      // - HTTPS 환경의 보안 쿠키까지 완벽하게 삭제합니다.
      await signOut({ callbackUrl: '/', redirect: true });
    } catch (error) {
      console.error('Logout failed', error);
      // 실패 시 강제 이동
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
            <span>📈</span> AI 분석
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
              <span>📑</span> AI 관리
            </Link>
          </li>
        )}
      </ul>

      {/* 3. 하단 (프로필 + 로그아웃) */}

      {isDeviceUser && (
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
      )}

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