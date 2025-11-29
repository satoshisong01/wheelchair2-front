'use client';

import { useState, useEffect, Suspense } from 'react'; // 🚨 [FIX] Suspense import 추가
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

// ⭐️ [FIX 1] useSearchParams를 사용하는 핵심 로직을 내부 함수로 분리
function AdminPortalContent() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams(); // 🚨 [FIX] 이 함수가 Suspense 내부에 있게 됨
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const authError = searchParams.get('error');
    if (authError) {
      setError('로그인에 실패했습니다. 카카오 계정을 다시 확인해주세요.');
    }
  }, [searchParams]);

  useEffect(() => {
    if (status === 'authenticated') {
      console.log(
        `[APP-PORTAL-DEBUG] 로그인 상태 확인됨. 역할: ${session.user.role}.`
      );
    }
  }, [status, session]);

  const handleKakaoLogin = () => {
    setIsLoading(true);
    setError(null);
    signIn('kakao');
  };

  // 로딩 중이거나 이미 로그인된 상태면 (미들웨어 처리 대기 중) 로딩 UI를 보여줌
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

// ⭐️ [FIX 2] Suspense Wrapper를 메인 export에 추가
export default function AdminPortalPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AdminPortalContent />
    </Suspense>
  );
}
