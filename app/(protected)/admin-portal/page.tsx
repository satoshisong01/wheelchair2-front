'use client';

import { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './page.module.css'; // ‼️ (CSS 파일도 새로 만듭니다)
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

export default function AdminPortalPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); // 1. 에러 메시지 처리 (유지)

  useEffect(() => {
    const authError = searchParams.get('error');
    if (authError) {
      setError('로그인에 실패했습니다. 카카오 계정을 다시 확인해주세요.');
    }
  }, [searchParams]);

  // ❌ 2. [제거됨] 이미 로그인된 경우 리디렉션 로직 제거!
  // 이 역할은 서버의 middleware.ts가 대신합니다.
  // 여기에 router.push 로직을 두면 middleware와 충돌하여 무한 루프를 유발합니다.
  useEffect(() => {
    // [APP-PORTAL-DEBUG] 로그인 상태 확인용 로그 추가
    if (status === 'authenticated') {
      console.log(
        `[APP-PORTAL-DEBUG] 로그인 상태 확인됨. 역할: ${session.user.role}. (Middleware가 리다이렉트 처리 중)`
      );
    }
  }, [status, session]); // 3. 카카오 로그인 핸들러 (유지)

  const handleKakaoLogin = () => {
    setIsLoading(true);
    setError(null); // 성공 시 Next-Auth 콜백이 /welcome 또는 /dashboard로 리디렉션합니다.
    signIn('kakao');
  }; // 로딩 중이거나 이미 로그인된 상태면 (미들웨어 처리 대기 중) 로딩 UI를 보여줌

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
