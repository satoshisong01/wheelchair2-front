'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './page.module.css';

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // 기기 로그인용 State
  const [deviceId, setDeviceId] = useState('');
  const [password, setPassword] = useState('');
  const [isDeviceLoading, setIsDeviceLoading] = useState(false);

  // 🚨 [핵심 수정] 리다이렉트 로직
  useEffect(() => {
    if (status === 'authenticated') {
      const user = session.user;

      // 1. PENDING(대기) 또는 REJECTED(거절) 사용자 -> /pending 페이지로 이동
      // (거기서 거절 사유를 확인하고 재신청할 수 있음)
      if (user.role === 'PENDING' || user.role === 'REJECTED') {
        console.log(`[LOGIN-PAGE] ${user.role} 상태 -> /pending 이동`);
        router.push('/pending');
        return;
      }

      // 2. MASTER (마스터) -> 대시보드로 직행
      if (user.role === 'MASTER') {
        router.push('/dashboard');
        return;
      }

      // 3. ADMIN (관리자) -> 프로필 미완료 시 Welcome, 완료 시 대시보드
      if (user.role === 'ADMIN') {
        if (!user.organization || !user.phoneNumber) {
          router.push('/welcome');
          return;
        }
        router.push('/dashboard');
        return;
      }

      // 4. DEVICE_USER (기기 사용자) -> 휠체어 정보
      if (user.role === 'DEVICE_USER') {
        router.push('/wheelchair-info');
        return;
      }

      // 5. 기타 -> 대시보드 (안전 장치)
      router.push('/dashboard');
    } else if (status === 'unauthenticated') {
      console.log('[LOGIN-PAGE] 로그인 대기 중');
    }
  }, [status, session, router]);

  // 🔐 기기 로그인 핸들러
  const handleDeviceLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDeviceLoading(true);

    const result = await signIn('credentials', {
      redirect: false,
      deviceId,
      password,
    });

    if (result?.error) {
      alert('로그인 실패: 아이디 또는 비밀번호를 확인하세요.');
      setIsDeviceLoading(false);
    } else {
      console.log('기기 로그인 성공');
      // useEffect가 리다이렉트 처리
    }
  };

  // 로딩 화면
  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className={`${styles.pageWrapper} ${styles.darkPageWrapper}`}>
        <main className={`${styles.main} ${styles.darkMain}`}>
          <div className={styles.content}>
            <h1 className={`${styles.title} ${styles.darkTitle}`}>
              로그인 중...
            </h1>
            <p className={`${styles.description} ${styles.darkDescription}`}>
              권한을 확인하고 있습니다...
            </p>
          </div>
        </main>
      </div>
    );
  }

  // 로그인 화면 (기기 로그인 + 관리자 로그인)
  return (
    <div className={`${styles.pageWrapper} ${styles.darkPageWrapper}`}>
      <main className={`${styles.main} ${styles.darkMain}`}>
        <div className={styles.logo}>
          <span
            style={{ color: '#007bff', fontSize: '1.5rem', fontWeight: 700 }}
          >
            FIRST C&D
          </span>
        </div>

        <div className={styles.content}>
          <h1 className={`${styles.title} ${styles.darkTitle}`}>
            IoT 커넥티드 모빌리티
          </h1>
          <p className={`${styles.description} ${styles.darkDescription}`}>
            기기 사용자는 ID로 로그인하고,
            <br />
            관리자는 카카오 계정으로 로그인하세요.
          </p>
        </div>

        {/* 1. 기기 로그인 폼 */}
        <form
          onSubmit={handleDeviceLogin}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            width: '100%',
            maxWidth: '320px',
          }}
        >
          <input
            type="text"
            placeholder="기기 ID 입력"
            style={{
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #ddd',
            }}
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            required
            disabled={isDeviceLoading}
          />
          <input
            type="password"
            placeholder="비밀번호"
            style={{
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #ddd',
            }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isDeviceLoading}
          />
          <button
            type="submit"
            className={`${styles.primaryButton} ${styles.darkPrimaryButton}`}
            disabled={isDeviceLoading}
          >
            {isDeviceLoading ? '로그인 중...' : '기기 로그인'}
          </button>
        </form>

        <div style={{ margin: '20px 0', color: '#666', fontSize: '0.9rem' }}>
          또는
        </div>

        {/* 2. 관리자 로그인 버튼 */}
        <div className={styles.buttons}>
          <button
            onClick={() => signIn('kakao')}
            className={`${styles.secondaryButton} ${styles.darkSecondaryButton}`}
          >
            관리자(카카오) 로그인
          </button>
        </div>
      </main>
    </div>
  );
}
