'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react'; // ‼️ 'update' 함수 포함
import { useRouter } from 'next/navigation';
import styles from './page.module.css'; // ‼️ CSS 모듈 사용
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

export default function WelcomePage() {
  const router = useRouter(); // ‼️ [수정] update 함수: DB 변경 후 클라이언트 세션을 갱신할 때 필요
  const { data: session, status, update } = useSession(); // ‼️ 폼을 위한 State

  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); // 1. [로직] 세션이 로드되면, 폼에 기본값 채우기 (유지)

  useEffect(() => {
    if (session) {
      setName(session.user.name || '');
      setOrganization(session.user.organization || '');
      setPhoneNumber(session.user.phoneNumber || '');
    }
  }, [session]); // 2. [로직 제거] 불필요한 클라이언트 리디렉션 로직 제거! // 이 페이지에 PENDING이 아닌 유저(MASTER/ADMIN)가 들어오거나, // PENDING인데 이미 정보가 완료된 유저가 들어오는 경우, // router.push는 middleware.ts가 책임지고 처리합니다.

  useEffect(() => {
    if (status === 'authenticated') {
      console.log(
        `[WELCOME-PAGE-DEBUG] 인증 상태 확인됨. 역할: ${session.user.role}. 클라이언트 리다이렉트 제거됨.`
      );
    }
  }, [status, session]); // 3. [로직] 폼 제출 핸들러 (유지)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // 4. [신규 API] '/api/auth/complete-profile' 호출
      const response = await fetch('/api/auth/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, organization, phoneNumber }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || '프로필 업데이트에 실패했습니다.');
      } // 5. [핵심] DB 업데이트 성공 시, 클라이언트 세션 갱신!

      await update(); // 6. '승인 대기' 페이지로 이동 (✅ 이 로직은 Form 제출 후 이동이므로 유지)

      router.push('/pending');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }; // 로딩 중이거나, PENDING 상태가 아닌 경우 (리디렉션 대기) // middleware가 처리할 때까지 로딩 화면을 보여줍니다.

  if (status === 'loading' || !session || session.user.role !== 'PENDING') {
    return <LoadingSpinner />;
  } // --- ‼️ PENDING이면서 정보 입력이 필요한 사용자에게 보여줄 UI 폼 ---

  return (
    <div className={styles.container}>
      <div className={styles.welcomeBox}>
        <h1 className={styles.title}>환영합니다, 관리자님</h1>
        <p className={styles.subtitle}>
          마스터 관리자의 승인을 받기 위해, 프로필 정보를 입력해주세요.
        </p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="email">이메일 (카카오 계정)</label>
            <input
              id="email"
              type="email"
              value={session.user.email || '이메일 없음'}
              disabled // 이메일은 변경 불가
            />
          </div>
          <div className={styles.inputGroup}>
            <label htmlFor="name">이름</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isLoading}
              placeholder="홍길동"
            />
          </div>
          <div className={styles.inputGroup}>
            <label htmlFor="organization">소속</label>
            <input
              id="organization"
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              required
              disabled={isLoading}
              placeholder="(예: 근로복지공단 재활공학연구소)"
            />
          </div>
          <div className={styles.inputGroup}>
            <label htmlFor="phoneNumber">전화번호</label>
            <input
              id="phoneNumber"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
              disabled={isLoading}
              placeholder="010-1234-5678"
            />
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button
            type="submit"
            className={styles.submitButton}
            disabled={isLoading}
          >
            {isLoading ? '저장 중...' : '정보 저장 및 승인 요청'}
          </button>
        </form>
      </div>
    </div>
  );
}
