// app/(protected)/audit-log/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface AuditLog {
    id: string;
    userId: string;
    userRole: string;
    action: string;
    details: any;
    createdAt: string;
}

export default function AuditLogPage() {
    const { data: session, status } = useSession();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);

    // 데이터 로딩
    useEffect(() => {
        // @ts-ignore
        if (status === 'loading' || session?.user?.role !== 'MASTER') return;

        const fetchLogs = async () => {
            setLoading(true);
            try {
                const res = await fetch('/api/admin/audit-log'); // 2단계에서 만든 API
                if (res.ok) {
                    setLogs(await res.json());
                } else {
                    alert('로그를 불러오는 데 실패했습니다.');
                }
            } catch (error) {
                console.error('Error fetching logs:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();
    }, [session, status]);


    // 렌더링
    // @ts-ignore
    if (status === 'loading' || session?.user?.role !== 'MASTER') {
         return <div>로딩 중이거나 접근 권한이 없습니다.</div>;
    }

    if (loading) return <div>로그를 불러오는 중...</div>;

    return (
        <div style={{ padding: '20px' }}>
            <h1 style={{ borderBottom: '2px solid #333', paddingBottom: '10px' }}>
                관리자(ADMIN) 활동 감사 로그
            </h1>
            
            {logs.length === 0 ? (
                <p>조회된 ADMIN 활동 로그가 없습니다. (ADMIN이 활동하면 여기에 기록됩니다.)</p>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f0f0f0' }}>
                            <th style={{ border: '1px solid #ccc', padding: '10px' }}>시간</th>
                            <th style={{ border: '1px solid #ccc', padding: '10px' }}>액션</th>
                            <th style={{ border: '1px solid #ccc', padding: '10px' }}>User ID</th>
                            <th style={{ border: '1px solid #ccc', padding: '10px' }}>상세</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map(log => (
                            <tr key={log.id}>
                                <td style={{ border: '1px solid #ccc', padding: '10px' }}>{new Date(log.createdAt).toLocaleString()}</td>
                                <td style={{ border: '1px solid #ccc', padding: '10px', fontWeight: 'bold' }}>{log.action}</td>
                                <td style={{ border: '1px solid #ccc', padding: '10px' }}>{log.userId}</td>
                                <td style={{ border: '1px solid #ccc', padding: '10px', fontSize: '12px' }}>{JSON.stringify(log.details)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}