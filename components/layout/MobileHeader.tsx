// components/layout/MobileHeader.tsx
'use client';

import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import styles from './MobileHeader.module.css';

export default function MobileHeader() {
  const { data: session } = useSession();
  const userRole = session?.user?.role;
  const isDeviceUser = userRole === 'DEVICE_USER'; // 기기 사용자 여부 확인

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
    <header className={styles.header}>
      <div className={styles.logo}>
        {/* 기기 사용자는 '휠체어 정보', 관리자는 '대시보드'로 이동 */}
        <Link href={isDeviceUser ? '/wheelchair-info' : '/dashboard'}>
          FIRST C&D
        </Link>
      </div>

      <div className={styles.actions}>
        {/* 로그아웃 버튼 */}
        <button
          style={{
            border: '2px solid black',
            borderRadius: '5px',
            fontWeight: 'bold',
            marginRight: '10px',
          }}
          className={`${styles.iconBtn} ${styles.logoutBtn}`}
          onClick={handleLogout}
          aria-label="로그아웃"
        >
          logout🚪
        </button>

        {/* 권한에 따라 아이콘 변경 */}
        {isDeviceUser ? (
          // 🟢 [수정] SVG 삭제 -> 심플한 이모지 적용
          <Link
            href="/mypage"
            className={styles.iconBtn}
            aria-label="마이페이지"
            style={{ textDecoration: 'none', fontSize: '24px' }} // 이모지 크기 조절
          >
            ⚙️
          </Link>
        ) : (
          // 관리자: 햄버거 메뉴
          <button className={styles.iconBtn}>☰</button>
        )}
      </div>
    </header>
  );
}
