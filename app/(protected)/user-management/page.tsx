// app/(protected)/user-management/page.tsx (최종 수정)

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
// import styles from './management.module.css'; // ❌ 빌드 에러 방지를 위해 제거

interface PendingUser {
    id: string;
    email: string;
    name: string;
    organization: string;
    phoneNumber: string;
    createdAt: string;
}

// 임시 로딩 스피너 컴포넌트
const LoadingSpinner = () => <div style={{ padding: '20px', textAlign: 'center' }}>데이터 로딩 중...</div>;


export default function UserManagementPage() {
    const { data: session, status } = useSession();
    const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [rejectionReason, setRejectionReason] = useState('');

    const fetchPendingUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/users'); // MASTER용 GET API
            if (res.ok) {
                setPendingUsers(await res.json());
            } else {
                alert('사용자 목록을 불러오는 데 실패했습니다.');
            }
        } catch (error) {
            console.error('Error fetching pending users:', error);
        } finally {
            setLoading(false);
        }
    };
    
    // 컴포넌트 마운트 시 데이터 로딩
    useEffect(() => {
        // @ts-ignore
        if (status === 'loading' || session?.user?.role !== 'MASTER') return;
        fetchPendingUsers();
    }, [session, status]);

    // 승인/거절 처리 핸들러
    const handleUpdateRole = async (userId: string, role: 'USER' | 'REJECTED') => {
        if (role === 'REJECTED' && !rejectionReason) {
            alert('거절 사유를 입력해주세요.');
            return;
        }

        const confirmMessage = role === 'USER' 
            ? '정말로 승인(USER)하시겠습니까?'
            : `정말로 거절하시겠습니까?\n사유: ${rejectionReason}`;

        if (!confirm(confirmMessage)) return;

        try {
            const res = await fetch('/api/admin/users', { // MASTER용 PUT API
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    newRole: role,
                    rejectionReason: role === 'REJECTED' ? rejectionReason : undefined,
                }),
            });

            if (res.ok) {
                alert(role === 'USER' ? '승인되었습니다.' : '거절되었습니다.');
                fetchPendingUsers(); // 목록 갱신
                setRejectionReason(''); 
            } else {
                alert('업데이트 실패: ' + (await res.json()).message);
            }
        } catch (error) {
            console.error('Update error:', error);
            alert('업데이트 중 오류가 발생했습니다.');
        }
    };
    
    // 렌더링
    // @ts-ignore
    if (status === 'loading' || session?.user?.role !== 'MASTER') {
         // MASTER가 아니거나 로딩 중일 때
         if (status === 'loading') return <LoadingSpinner />;
         return <div>접근 권한이 없습니다. (MASTER만 접근 가능)</div>;
    }

    if (loading) return <LoadingSpinner />;

    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', borderBottom: '2px solid #333', paddingBottom: '10px' }}>
                승인 대기 사용자 관리 ({pendingUsers.length}명)
            </h1>
            
            <input
                type="text"
                placeholder="거절 시 사용할 공통 사유 입력"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                style={{ marginBottom: '20px', padding: '10px', width: '100%', border: '1px solid #ccc', borderRadius: '4px' }}
            />

            {pendingUsers.length === 0 ? (
                <p>현재 승인 대기 중인 사용자가 없습니다.</p>
            ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {pendingUsers.map(user => (
                        <li key={user.id} style={{ border: '1px solid #ddd', padding: '15px', marginBottom: '10px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ flexGrow: 1 }}>
                                <strong style={{ fontSize: '16px' }}>{user.name}</strong> ({user.email})
                                <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>소속: {user.organization}</p>
                                <p style={{ margin: '0', fontSize: '14px' }}>연락처: {user.phoneNumber}</p>
                            </div>
                            <div style={{ marginTop: '10px' }}>
                                <button 
                                    onClick={() => handleUpdateRole(user.id, 'USER')}
                                    style={{ padding: '8px 15px', marginRight: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                    ✅ 승인 (USER)
                                </button>
                                <button 
                                    onClick={() => handleUpdateRole(user.id, 'REJECTED')}
                                    style={{ padding: '8px 15px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                    ❌ 거절
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}