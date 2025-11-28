'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

// ------------------------------------------------
// 1. 데이터 타입 정의
// ------------------------------------------------
interface AuditLog {
    id: string;
    user_id: string;
    userRole: string;
    action: string;
    details: any; 
    createdAt: string; // DB에서 온 유효한 타임스탬프 문자열 (예: "2025-11-28 18:09:443")
    device_serial?: string; // ✅ 백엔드에서 JOIN하여 추가된 기기 시리얼 번호 필드 (이것을 사용해야 함)
}

// ------------------------------------------------
// 2. Helper Functions (Color Coding & Formatting)
// ------------------------------------------------

// 액션별 색상 및 라벨 정의
const LOG_CONFIG = {
    LOGIN: { color: '#007bff', label: '로그인', bg: '#e9f7ff' },
    LOGOUT: { color: '#6c757d', label: '로그아웃', bg: '#f8f9fa' },
    DEVICE_REGISTER: { color: '#28a745', label: '기기 등록', bg: '#e6ffed' },
    DEVICE_DELETE: { color: '#dc3545', label: '기기 삭제', bg: '#f8d7da' },
    USER_UPDATE: { color: '#ffc107', label: '사용자 수정', bg: '#fff3cd' },
    DEFAULT: { color: '#000', label: '기타 활동', bg: '#fff' },
};

const getLogStyle = (action: string) => {
    return LOG_CONFIG[action as keyof typeof LOG_CONFIG] || LOG_CONFIG.DEFAULT;
};

/**
 * 로그 상세(Details) 정보를 사람이 읽기 쉬운 문장으로 포맷합니다.
 * @param log - 전체 AuditLog 객체
 */
const formatLogMessage = (log: AuditLog) => {
    const { action, details } = log;
    
    // 1. 시리얼 번호 결정 (루트 필드 우선 사용, 없으면 details에서 추출)
    // ✅ 백엔드 JOIN을 통한 최상위 필드 사용을 우선합니다.
    const serial = log.device_serial || details?.serial; 
    const wheelchairId = details?.wheelchairId;

    if (!details) {
        return "상세 정보 없음";
    }

    switch (action) {
        case 'DEVICE_REGISTER':
            // ✅ 시리얼 번호 표시 우선
            return serial 
                ? `기기 시리얼 ${serial}이 등록되었습니다. (모델: ${details.model || 'N/A'})`
                : `기기 등록 (ID: ${wheelchairId || 'N/A'})`;
        
        case 'DEVICE_DELETE':
            // ✅ 시리얼 번호 표시 우선
            return serial 
                ? `기기 시리얼 ${serial}이 삭제되었습니다.` 
                : `기기 삭제 (ID: ${wheelchairId || 'N/A'})`; // 시리얼이 없으면 임시로 ID 표시
        
        case 'LOGIN':
            return `로그인 성공 (Email: ${details.email || 'N/A'})`;
        
        case 'LOGOUT':
            return `로그아웃 (정상 종료)`;
        
        default:
            // 그 외 액션은 원시 JSON 문자열로 표시하되, 너무 길면 자릅니다.
            const detailStr = JSON.stringify(details);
            return detailStr.length > 100 ? `${detailStr.substring(0, 100)}...` : detailStr;
    }
};


// ------------------------------------------------
// 3. 메인 컴포넌트
// ------------------------------------------------

export default function AuditLogPage() {
    const { data: session, status } = useSession();
    const router = useRouter(); 
    
    // [필터 상태] 날짜 필터 상태 추가
    const today = new Date().toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);

    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);

    // 1. 데이터 로딩 함수 (날짜 파라미터 포함)
    const fetchLogs = useCallback(async (start: string, end: string) => {
        setLoading(true);
        try {
            // API 호출 시 날짜 파라미터 전달
            const res = await fetch(`/api/admin/audit-log?startDate=${start}&endDate=${end}`);
            if (!res.ok) {
                // 권한 에러 등 처리
                alert('로그를 불러오는 데 실패했습니다.');
                return;
            }
            const data = await res.json();
            setLogs(data);
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // 2. 필터 변경 시 데이터 재로딩
    useEffect(() => {
        // @ts-ignore
        if (status === 'authenticated' && (session?.user?.role === 'MASTER' || session?.user?.role === 'ADMIN')) {
            fetchLogs(startDate, endDate);
        }
    }, [session, status, startDate, endDate, fetchLogs]);


    // 3. 렌더링 - 권한 및 로딩 체크
    // @ts-ignore
    if (status === 'loading' || !(session?.user?.role === 'MASTER' || session?.user?.role === 'ADMIN')) {
         return <div>접근 권한이 없거나 로딩 중입니다.</div>;
    }

    return (
        <div style={{ padding: '30px', maxWidth: '1000px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', borderBottom: '2px solid #333', paddingBottom: '10px' }}>
                관리자({session.user.role}) 활동 감사 로그
            </h1>
            
            {/* 날짜 필터링 컴포넌트 */}
            <div style={{ margin: '20px 0', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <label>날짜 범위:</label>
                <input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)} 
                    style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
                <span>~</span>
                <input 
                    type="date" 
                    value={endDate} 
                    onChange={(e) => setEndDate(e.target.value)} 
                    style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
            </div>
            
            {loading && <div>로그를 불러오는 중...</div>}
            
            {!loading && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                    <thead><tr>
                        {/* ✅ [TITLE FIX] 시간 대신 날짜/시간으로 변경 */}
                        <th style={{ border: '1px solid #ccc', padding: '10px' }}>날짜/시간</th>
                        <th style={{ border: '1px solid #ccc', padding: '10px' }}>액션</th>
                        <th style={{ border: '1px solid #ccc', padding: '10px' }}>User ID</th>
                        <th style={{ border: '1px solid #ccc', padding: '10px' }}>상세</th>
                    </tr></thead><tbody>
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan={4} style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'center' }}>
                                    선택된 기간에 기록된 활동 로그가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            logs.map(log => {
                                const style = getLogStyle(log.action);

                                // ✅ [DATE FIX] Invalid Date 해결: 공백을 'T'로 치환하여 Date 객체 생성 시 오류 방지
                                const logDate = log.createdAt 
                                    ? new Date(log.createdAt.replace(' ', 'T')) 
                                    : null;
                                
                                return (
                                    <tr key={log.id} style={{ backgroundColor: style.bg }}>
                                        <td style={{ border: '1px solid #ccc', padding: '10px', fontSize: '14px' }}>
                                            {logDate && !isNaN(logDate.getTime()) 
                                                ? format(logDate, 'yyyy. MM. dd. HH:mm') // 원하는 날짜/시간 포맷
                                                : '날짜 정보 오류'}
                                        </td>
                                        <td style={{ border: '1px solid #ccc', padding: '10px', fontWeight: 'bold', color: style.color }}>
                                            {style.label} ({log.action})
                                        </td>
                                        <td style={{ border: '1px solid #ccc', padding: '10px', fontSize: '14px' }}>
                                            {log.user_id ? `${log.user_id.substring(0, 8)}...` : '-'}
                                        </td>
                                        {/* ✅ [MESSAGE FIX] 포맷팅 함수에 log 전체 객체 전달 */}
                                        <td style={{ border: '1px solid #ccc', padding: '10px', fontSize: '12px' }}>
                                            {formatLogMessage(log)}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            )}
        </div>
    );
}