'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

function AdminPortalContent() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const authError = searchParams.get('error');
    if (authError) {
      setError('로그인에 실패했습니다. 카카오 계정을 다시 확인해주세요.');
    }
  }, [searchParams]);

  // ⭐️ [FIX] 로그인이 되어있으면 대시보드로 강제 이동 (무한 로딩 방지)
  useEffect(() => {
    if (status === 'authenticated') {
      console.log(
        `[Redirect] 이미 로그인됨 (${session?.user?.role}) -> 대시보드 이동`
      );
      router.replace('/dashboard'); // 🚀 이 줄이 없어서 멈춰있던 것입니다.
    }
  }, [status, session, router]);

  const handleKakaoLogin = () => {
    setIsLoading(true);
    setError(null);
    signIn('kakao', { callbackUrl: '/dashboard' }); // 로그인 후 이동할 곳 명시
  };

  // 로딩 중이거나 로그인 확인 중일 때만 스피너 표시
  if (status === 'loading' || status === 'authenticated') {
    return <LoadingSpinner />;
  }

  return (
    <div className={styles.container}>
      <div className={styles.loginBox}>
        <h1 className={styles.title}>관리자 포털</h1>
        <p className={styles.subtitle}>
          관리자 및 마스터 계정 전용 로그인 페이지입니다.
        </p>
        {error && <p className={styles.error}>{error}</p>}
        <button
          onClick={handleKakaoLogin}
          className={styles.kakaoButton}
          disabled={isLoading}
        >
          {isLoading ? '로그인 처리 중...' : '카카오 계정으로 로그인'}
        </button>
        <div className={styles.deviceLoginLink}>
          <a href="/">일반 기기 로그인 페이지로 돌아가기</a>
        </div>
      </div>
    </div>
  );
}

export default function AdminPortalPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AdminPortalContent />
    </Suspense>
  );
}
