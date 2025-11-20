'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { User, UserRole } from '@/entities/User';
import styles from './page.module.css';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

// 타입 정의 업데이트
type AdminUserView = Pick<
  User,
  | 'id'
  | 'name'
  | 'email'
  | 'organization'
  | 'phoneNumber'
  | 'role'
  | 'createdAt'
  | 'rejectionReason'
>;

export default function UserManagementPage() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. 사용자 목록 불러오기
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('사용자 목록 로딩 실패');
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && session.user.role === 'MASTER') {
      fetchUsers();
    }
  }, [status, session, fetchUsers]);

  // 2. 승인 핸들러
  const handleApprove = async (userId: number, userName: string) => {
    if (!confirm(`${userName}님을 관리자로 승인하시겠습니까?`)) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'ADMIN' }),
      });

      if (!res.ok) throw new Error('승인 실패');

      alert(`${userName}님이 승인되었습니다.`);
      fetchUsers(); // 목록 새로고침 (확실한 데이터 동기화)
    } catch (err: any) {
      alert(err.message);
    }
  };

  // 3. 거절 핸들러
  const handleReject = async (userId: number, userName: string) => {
    // 거절 사유 입력받기 (간단히 prompt 사용, 추후 모달로 고도화 가능)
    const reason = prompt(
      `${userName}님의 승인을 거절하시겠습니까?\n거절 사유를 입력해주세요:`
    );

    if (reason === null) return; // 취소 누름
    if (reason.trim() === '') {
      alert('거절 사유를 반드시 입력해야 합니다.');
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'REJECTED', reason: reason }),
      });

      if (!res.ok) throw new Error('거절 처리 실패');

      alert(`${userName}님의 승인이 거절되었습니다.\n(사유: ${reason})`);
      fetchUsers(); // 목록 새로고침
    } catch (err: any) {
      alert(err.message);
    }
  };

  // UI 렌더링
  if (isLoading || status === 'loading')
    return (
      <LoadingSpinner />
    );
  if (error)
    return (
      <div className={styles.container}>
        <p className={styles.error}>{error}</p>
        <button onClick={fetchUsers}>다시 시도</button>
      </div>
    );
  if (status !== 'authenticated' || session.user.role !== 'MASTER') return null;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>회원 관리 (MASTER)</h1>
      <p className={styles.subtitle}>관리자 계정 승인 및 관리</p>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>상태</th>
              <th>이름</th>
              <th>소속</th>
              <th>연락처</th>
              <th>가입일</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.emptyCell}>
                  사용자가 없습니다.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>
                    <span
                      className={`${styles.roleBadge} ${
                        styles[user.role.toLowerCase()]
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td>{user.name}</td>
                  <td>{user.organization}</td>
                  <td>{user.phoneNumber}</td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>
                    {user.role === 'PENDING' && (
                      <div className={styles.actionButtons}>
                        <button
                          className={`${styles.actionButton} ${styles.approveButton}`}
                          onClick={() =>
                            handleApprove(user.id, user.name || '')
                          }
                        >
                          승인
                        </button>
                        <button
                          className={`${styles.actionButton} ${styles.rejectButton}`}
                          onClick={() => handleReject(user.id, user.name || '')}
                        >
                          거절
                        </button>
                      </div>
                    )}
                    {user.role === 'REJECTED' && (
                      <span
                        className={styles.rejectReason}
                        title={user.rejectionReason || ''}
                      >
                        거절됨 ({user.rejectionReason})
                      </span>
                    )}
                    {user.role === 'ADMIN' && (
                      <span className={styles.actionDone}>-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
