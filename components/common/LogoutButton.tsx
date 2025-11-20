'use client';

import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import styles from './LogoutButton.module.css';

export default function LogoutButton() {
  const { data: session } = useSession();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push('/login');
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

