'use client';

import Link from 'next/link';
import styles from './MobileHeader.module.css'; // 아래 CSS 파일 생성 필요

export default function MobileHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        <Link href="/dashboard">FIRST C&D</Link>
      </div>
      <div className={styles.actions}>
        {/* 검색 아이콘 (임시) */}
        <button className={styles.iconBtn}>🔍</button>
        {/* 알림 아이콘 (임시) */}
        <button className={styles.iconBtn}>
          🔔<span className={styles.badge}></span>
        </button>
        {/* 햄버거 메뉴 (임시) */}
        <button className={styles.iconBtn}>☰</button>
      </div>
    </header>
  );
}
