'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function RegisterCheckPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [message, setMessage] = useState('가입 상태를 확인 중입니다...');

  useEffect(() => {
    // 1. 세션 로딩이 완료되었고, 인증된 상태(authenticated)라면
    if (status === 'authenticated') {
      // 🚨 신규 관리자 프로필 체크: 이름, 소속, 연락처 중 누락된 것이 있는지 확인
      const isProfileComplete =
        session.user.name &&
        session.user.organization &&
        session.user.phoneNumber; // 2. [신규 사용자] 프로필 미작성자라면 /welcome으로 이동

      if (!isProfileComplete) {
        console.log(
          '[REGISTER-CHECK-DEBUG] 신규 가입자 또는 프로필 미완성. /welcome 페이지로 이동'
        );
        router.replace('/welcome');
        return;
      } // 3. [기존 사용자] 프로필이 이미 완성된 경우

      if (isProfileComplete) {
        // ❌ alert 대신 콘솔 로그 및 메시지 업데이트
        console.log(
          `[REGISTER-CHECK-DEBUG] 이미 가입 및 프로필이 완성된 사용자. 역할: ${session.user.role}`
        );
        setMessage('이미 등록된 계정입니다. 권한을 확인하고 있습니다...');

        // ⚠️ [핵심 수정] 클라이언트 리다이렉트 제거!
        // 프로필이 완성된 사용자는 이제 middleware.ts가 role에 맞게
        // /dashboard (ADMIN/MASTER) 또는 /pending (PENDING)으로 보내줄 것입니다.
        return;
      }
    } // 4. (예외) 로그인 안 했으면: 이 역시 middleware.ts가 처리해야 안전합니다.
    // 클라이언트 리다이렉트 제거. // if (status === 'unauthenticated') { //  router.replace('/admin-portal'); // }
  }, [status, session, router]); // 이 페이지는 사용자에게 "잠깐" 보임 (middleware가 이동시키기 전까지)

  return (
    <div className={styles.container}>
      <h1 className={styles.message}>{message}</h1>
    </div>
  );
}
