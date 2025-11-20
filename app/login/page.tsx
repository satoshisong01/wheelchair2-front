'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

// (참고) 간단한 인라인 스타일
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
    padding: '1rem',
  },
  card: {
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '0.5rem',
    boxShadow:
      '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    textAlign: 'center' as 'center',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#111827',
  },
  message: {
    color: '#6b7280',
    margin: '0.5rem 0 1.5rem 0',
  },
  kakaoButton: {
    padding: '0.75rem 1rem',
    backgroundColor: '#FEE500', // 카카오 노란색
    color: '#191919',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '1rem',
    width: '100%',
  },
};

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // 🚨 [수정] 클라이언트 리다이렉트 로직 제거
    // 로그인 상태 확인 및 리다이렉션은 middleware.ts가 담당합니다.
    if (status === 'authenticated') {
      console.log(
        '[LOGIN-PAGE-DEBUG] 인증 상태 확인됨. middleware.ts가 처리 중.'
      );
    }
  }, [status, router]); // 2. 로그인 상태를 확인 중이거나, 이미 로그인되었다면 로딩 화면 표시

  if (status === 'loading' || status === 'authenticated') {
    return <LoadingSpinner />;
  } // 3. 로그인이 안 된 사용자에게만 로그인 페이지 표시

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>로그인</h1>
        <p style={styles.message}>서비스 이용을 위해 로그인이 필요합니다.</p>

        <button
          onClick={() => signIn('kakao')} // 'kakao' provider로 로그인
          style={styles.kakaoButton}
        >
          카카오로 1초만에 로그인하기
        </button>
      </div>
    </div>
  );
}
