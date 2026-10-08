// app/login/LoginClient.tsx — 관리자(카카오) 로그인 화면. 배너 문구는 서버 래퍼(page.tsx)가 넘겨줌
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
  // 🔒 [IA-08] 시스템 사용 알림 배너
  notice: {
    margin: '0 0 1.25rem 0',
    padding: '0.75rem',
    borderRadius: '0.375rem',
    border: '1px solid #fde68a',
    backgroundColor: '#fffbeb',
    color: '#92400e',
    fontSize: '0.75rem',
    lineHeight: 1.6,
    textAlign: 'center' as const,
    whiteSpace: 'pre-line' as const, // MASTER가 넣은 줄바꿈 유지
  },
};

interface LoginClientProps {
  bannerText: string; // 🔒 [uc_auth_11] MASTER가 설정한 사용 알림 문구
}

export default function LoginClient({ bannerText }: LoginClientProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  // 🩺 화면을 열 때 앱(WebView)에 SESSION_EXPIRED를 보내지 않는다 — 앱은 이 메시지로 FCM 구독을 해지하므로,
  //    휠체어 사용자가 첫 화면에서 실수로 카카오 로그인 버튼을 눌러도 안전 알림 구독이 끊기지 않게.
  //    구독 해지는 명시적 로그아웃(LOGOUT 메시지)에서만 한다

  useEffect(() => {
    // ⭐️ [FIX] 인증되면 무조건 login 페이지를 떠나 root('/')로 이동합니다.
    // 미들웨어가 /welcome, /pending 등으로 최종 경로를 결정합니다.
    if (status === 'authenticated') {
      console.log(
        '[LOGIN-PAGE-DEBUG] 인증 상태 확인됨. 즉시 login 페이지 이탈.'
      );
      router.replace('/');
    }
  }, [status, router]);

  // 2. 로그인 상태를 확인 중이라면 스피너 표시
  if (status === 'loading') {
    return <LoadingSpinner />;
  }

  // 3. 로그인이 안 된 사용자에게만 로그인 페이지 표시
  // ⭐️ status === 'unauthenticated' 일 때만 아래 UI를 보여줍니다.
  if (status !== 'authenticated') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>로그인</h1>
          <p style={styles.message}>서비스 이용을 위해 로그인이 필요합니다.</p>

          {/* 🔒 [IA-08] 시스템 사용 알림 메시지 (인가 사용자 고지) — 텍스트로만 렌더 */}
          <div style={styles.notice}>{bannerText}</div>

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

  // 5. authenticated 상태일 경우 (useEffect가 router.replace('/')를 실행하기 전)
  return <LoadingSpinner />;
}
