'use client';

import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import styles from './LogoutButton.module.css';

export default function LogoutButton() {
  const { data: session } = useSession();
  const router = useRouter();

  const handleLogout = async () => {
    // 앱(WebView) 환경에 LOGOUT 신호 전달
    try {
      if ((window as any).ReactNativeWebView) {
        (window as any).ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'LOGOUT' }),
        );
      }
    } catch (e) {
      console.error('LOGOUT postMessage 실패:', e);
    }

    await signOut({ redirect: false });
    router.push('/login');
    signOut({ callbackUrl: '/login' });
    router.refresh();
  };

  if (!session) {
    return null;
  }

  return (
    <button onClick={handleLogout} className={styles.logoutButton}>
      로그아웃
    </button>
  );
}



