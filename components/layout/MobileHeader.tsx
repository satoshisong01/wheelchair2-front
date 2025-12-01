'use client';

import Link from 'next/link';
import styles from './MobileHeader.module.css';

export default function MobileHeader() {
  // ⭐️ [추가] 사이드바에 있던 로그아웃 로직 그대로 가져옴
  const handleLogout = async () => {
    // 실수로 누르는 것 방지
    if (!confirm('정말 로그아웃 하시겠습니까?')) return;

    try {
      // 1. 쿠키 삭제 API 호출
      await fetch('/api/logout', { method: 'POST' });

      // 2. 클라이언트 스토리지 청소
      localStorage.clear();
      sessionStorage.clear();

      // 3. 페이지 완전 새로고침하며 이동
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed', error);
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

        {/* ⭐️ [신규] 로그아웃 버튼 추가 */}
        <button
          className={`${styles.iconBtn} ${styles.logoutBtn}`}
          onClick={handleLogout}
          aria-label="로그아웃"
        >
          로그아웃🚪
        </button>

        {/* 햄버거 메뉴 (추후 메뉴 확장용으로 둠) */}
        <button className={styles.iconBtn}>☰</button>
      </div>
    </header>
  );
}
