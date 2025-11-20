'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import styles from './pending.module.css';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

export default function PendingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      console.log(`[PENDING-PAGE] 현재 상태: ${session.user.role}`);
    }
  }, [status, session]);

  // 로딩 중
  if (status === 'loading' || status !== 'authenticated') {
    return <LoadingSpinner />;
  }

  const user = session.user;

  // -------------------------------------------------------
  // 1. 거절된(REJECTED) 경우 -> 사유 확인 및 재신청 유도
  // -------------------------------------------------------
  if (user.role === 'REJECTED') {
    return (
      <div className={styles.container}>
        {/* 거절 전용 스타일 (.rejectedBox) 적용 */}
        <div className={`${styles.pendingBox} ${styles.rejectedBox}`}>
          <h1 className={styles.title} style={{ color: '#dc3545' }}>
            🚫 승인 거절됨
          </h1>
          <p className={styles.subtitle}>관리자 승인 요청이 거절되었습니다.</p>

          {/* 거절 사유 표시 */}
          <div className={styles.reasonBox}>
            <strong className={styles.reasonLabel}>거절 사유:</strong>
            <p className={styles.reasonText}>
              {user.rejectionReason || '사유가 기재되지 않았습니다.'}
            </p>
          </div>

          <div className={styles.infoBox}>
            <p>
              입력하신 정보를 수정하여 다시 승인을 요청할 수 있습니다.
              <br />
              아래 버튼을 눌러 정보를 수정해주세요.
            </p>
          </div>

          {/* 재신청 버튼 -> Welcome 페이지로 이동 */}
          <button
            className={styles.reapplyButton}
            onClick={() => router.push('/welcome')}
          >
            정보 수정 및 재신청 하러가기
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // 2. 대기 중(PENDING) 경우 -> 기존 UI 유지
  // -------------------------------------------------------
  return (
    <div className={styles.container}>
      <div className={styles.pendingBox}>
        <h1 className={styles.title}>⏳ 승인 대기 중</h1>
        <p className={styles.subtitle}>
          관리자(<strong>{user.name}</strong>)님의 계정 승인을 요청했습니다.
        </p>
        <p className={styles.message}>
          마스터 관리자가 검토 후 승인할 예정입니다.
          <br />
          승인이 완료될 때까지 잠시 기다려주세요.
        </p>
        <div className={styles.infoBox}>
          <p>
            <strong>소속:</strong> {user.organization}
          </p>
          <p>
            <strong>연락처:</strong> {user.phoneNumber}
          </p>
        </div>
        <p className={styles.contact}>
          승인 관련 문의는 마스터 관리자에게 연락하세요.
        </p>
      </div>
    </div>
  );
}
