// components/layout/MobileHeader.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { signOut, useSession } from 'next-auth/react';
import { LogOut } from 'lucide-react';
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
        <Link href={isDeviceUser ? '/mobile-view' : '/dashboard'}>
          {/* 🟢 [수정] 텍스트 대신 로고 이미지 사용 */}
          <Image
            src="/logo.png"
            alt="FIRST C&D"
            width={120} // 로고 비율에 맞춰 조절 (예: 가로 120px)
            height={30} // 헤더 높이에 맞춰 조절 (예: 세로 30px)
            style={{ objectFit: 'contain' }} // 비율 유지
            priority // 상단 로고이므로 우선 로딩
          />
        </Link>
      </div>

      <div className={styles.actions}>
        {/* 로그아웃 버튼 */}
        <button
          className={`${styles.iconBtn} ${styles.logoutBtn}`}
          onClick={handleLogout}
          aria-label="로그아웃"
          title="로그아웃"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" aria-hidden />
          <span className="text-xs font-semibold ml-1 whitespace-nowrap">로그아웃</span>
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
