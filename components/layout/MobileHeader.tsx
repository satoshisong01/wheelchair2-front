'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react'; // ⭐️ [필수] Next-Auth 공식 로그아웃 함수 import
import styles from './MobileHeader.module.css';

export default function MobileHeader() {
  const handleLogout = async () => {
    // 1. 확인 창
    if (!confirm('정말 로그아웃 하시겠습니까?')) return;

    try {
      // 2. 클라이언트 스토리지 청소 (찌꺼기 데이터 제거)
      localStorage.clear();
      sessionStorage.clear();

      // 3. ⭐️ [핵심 수정] Next-Auth 공식 로그아웃 사용
      // - 이 함수가 서버 환경(HTTPS)에 맞는 보안 쿠키(__Secure-...)를 자동으로 찾아 삭제합니다.
      // - 로그아웃 후 메인 페이지('/')로 리다이렉트합니다.
      await signOut({ callbackUrl: '/', redirect: true });
    } catch (error) {
      console.error('Logout failed', error);
      // 만약 signOut이 실패하더라도 강제로 메인으로 이동
      window.location.href = '/';
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        <Link href="/dashboard">FIRST C&D</Link>
      </div>
      <div className={styles.actions}>
        {/* 기존 아이콘들 (기능 연결은 추후) */}
        {/* <button className={styles.iconBtn}>🔍</button> */}
        {/* <button className={styles.iconBtn}>🔔<span className={styles.badge}></span></button> */}

        {/* ⭐️ 로그아웃 버튼 */}
        <button
          style={{
            border: '2px solid black',
            borderRadius: '5px',
            fontWeight: 'bold',
          }}
          className={`${styles.iconBtn} ${styles.logoutBtn}`}
          onClick={handleLogout}
          aria-label="로그아웃"
        >
          {/* 아이콘만 깔끔하게 표시하거나, 원하시면 '로그아웃🚪' 텍스트를 넣으셔도 됩니다. */}
          logout🚪
        </button>

        {/* 햄버거 메뉴 (추후 메뉴 확장용) */}
        <button className={styles.iconBtn}>☰</button>
      </div>
    </header>
  );
}
