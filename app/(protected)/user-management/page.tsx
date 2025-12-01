'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import styles from './page.module.css';

interface User {
  id: string;
  email: string;
  nickname: string;
  name?: string;
  organization?: string;
  phone_number?: string;
  role: string;
  created_at: string;
  location1?: string;
  rejectionReason?: string;
}

export default function UserManagementPage() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');

  // 1. 사용자 목록 가져오기 & 정렬
  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/admin/users');

      if (res.ok) {
        const data: User[] = await res.json();

        // ⭐️ 정렬: PENDING -> 최신순
        const sortedList = data.sort((a, b) => {
          if (a.role === 'PENDING' && b.role !== 'PENDING') return -1;
          if (a.role !== 'PENDING' && b.role === 'PENDING') return 1;
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });

        setUsers(sortedList);
      } else {
        console.error('Failed to fetch users');
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role === 'MASTER') {
      fetchUsers();
    }
  }, [status, session]);

  // 2. 승인/거절 핸들러
  const handleUpdateRole = async (userId: string, role: string) => {
    if (role === 'REJECTED' && !rejectReason) {
      alert('거절 사유를 입력해주세요.');
      return;
    }

    // ⭐️ [FIX] 메시지 조건 수정 (ADMIN으로 승인하므로)
    const confirmMsg =
      role === 'ADMIN'
        ? '관리자(ADMIN)로 승인하시겠습니까?'
        : '거절하시겠습니까?';
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          reason: role === 'REJECTED' ? rejectReason : undefined,
        }),
      });

      if (res.ok) {
        alert('처리되었습니다.');
        setRejectReason('');
        fetchUsers(); // 목록 갱신
      } else {
        alert('처리 실패');
      }
    } catch (e) {
      console.error(e);
      alert('오류 발생');
    }
  };

  // 3. 상태 뱃지 렌더링
  const renderStatusBadge = (role: string) => {
    if (['ADMIN', 'MASTER'].includes(role)) {
      return (
        <span
          className={styles.roleBadge}
          style={{ backgroundColor: '#28a745', color: 'white' }}
        >
          ✅ 승인된 관리자 ({role})
        </span>
      );
    }
    // 기기 사용자인 경우 (혹시 목록에 뜬다면)
    if (role === 'USER' || role === 'DEVICE_USER') {
      return (
        <span
          className={styles.roleBadge}
          style={{ backgroundColor: '#17a2b8', color: 'white' }}
        >
          🤖 기기 사용자 ({role})
        </span>
      );
    }
    if (role === 'REJECTED') {
      return (
        <span
          className={styles.roleBadge}
          style={{ backgroundColor: '#dc3545', color: 'white' }}
        >
          🚫 거절된 회원
        </span>
      );
    }
    return <span className={styles.roleBadge}>{role}</span>;
  };

  if (status === 'loading' || isLoading) return <LoadingSpinner />;

  if (session?.user?.role !== 'MASTER') {
    return <div className="p-8 text-center">접근 권한이 없습니다.</div>;
  }

  const pendingCount = users.filter((u) => u.role === 'PENDING').length;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>
        승인 대기 사용자 관리 ({pendingCount}명 / 총 {users.length}명)
      </h1>

      {/* 거절 사유 입력창 */}
      {pendingCount > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <input
            type="text"
            placeholder="거절/반려 시 사용할 공통 사유 입력"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
        </div>
      )}

      {users.length === 0 ? (
        <p className={styles.emptyMsg}>사용자가 없습니다.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {users.map((user) => (
            <li
              key={user.id}
              style={{
                border: '1px solid #ddd',
                padding: '15px',
                marginBottom: '10px',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'white',
                borderLeft:
                  user.role === 'PENDING'
                    ? '5px solid #007bff'
                    : '1px solid #ddd',
                opacity: user.role !== 'PENDING' ? 0.8 : 1,
              }}
            >
              <div style={{ flexGrow: 1 }}>
                <strong style={{ fontSize: '16px' }}>
                  {user.name || user.nickname}
                </strong>
                {user.role === 'PENDING' && (
                  <span
                    style={{
                      marginLeft: '10px',
                      fontSize: '11px',
                      color: '#007bff',
                      backgroundColor: '#e7f1ff',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 'bold',
                    }}
                  >
                    NEW
                  </span>
                )}

                <p
                  style={{
                    margin: '5px 0 0 0',
                    fontSize: '14px',
                    color: '#555',
                  }}
                >
                  소속: {user.organization || user.location1 || '-'}
                </p>
                <p style={{ margin: '0', fontSize: '14px', color: '#555' }}>
                  연락처: {user.phone_number || '-'}
                </p>
                <p style={{ margin: '0', fontSize: '12px', color: '#999' }}>
                  가입: {new Date(user.created_at).toLocaleDateString()}
                </p>

                {user.rejectionReason && (
                  <p
                    style={{
                      margin: '5px 0 0',
                      color: '#dc3545',
                      fontSize: '13px',
                      fontWeight: 'bold',
                    }}
                  >
                    ※ 거절 사유: {user.rejectionReason}
                  </p>
                )}
              </div>

              <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                {user.role === 'PENDING' ? (
                  <>
                    {/* ⭐️ [FIX] 승인 시 'ADMIN' 권한 부여 */}
                    <button
                      onClick={() => handleUpdateRole(user.id, 'ADMIN')}
                      style={{
                        padding: '8px 15px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                      }}
                    >
                      ✅ 승인 (관리자)
                    </button>
                    <button
                      onClick={() => handleUpdateRole(user.id, 'REJECTED')}
                      style={{
                        padding: '8px 15px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                      }}
                    >
                      ❌ 거절
                    </button>
                  </>
                ) : (
                  renderStatusBadge(user.role)
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
