'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
// ⚠️ 반드시 npm install date-fns 를 실행해야 합니다.
import { format } from 'date-fns';
import styles from './page.module.css';

// ------------------------------------------------
// 1. 데이터 타입 정의
// ------------------------------------------------
interface AuditLog {
  id: string;
  user_id: string;
  userRole: string;
  action: string;
  details: any;
  createdAt: string;
  device_serial?: string; // 백엔드에서 조인하여 추가된 필드
}

// ------------------------------------------------
// 2. Helper Functions (Time Parsing, Color Coding, Message Formatting)
// ------------------------------------------------

// ⭐️ [DATE FIX] PostgreSQL 타임스탬프 문자열을 안전하게 Date 객체로 변환
const safeParseDate = (dateString: string) => {
  if (!dateString) return null;
  // '2025-11-28 18:09:443' 형태의 공백을 ISO 포맷 'T'로 치환하여 파싱 오류 방지
  const cleanString = dateString.replace(' ', 'T').split('.')[0];
  const date = new Date(cleanString);
  return isNaN(date.getTime()) ? null : date;
};

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
 * ⭐️ [MESSAGE FIX] 로그 상세(Details) 메시지 포맷팅 함수
 */
const formatLogMessage = (log: AuditLog) => {
  const details = log.details;
  const action = log.action;

  const serial = details?.deviceSerial;
  const userName = details?.userName || log.user_name;

  switch (action) {
    case 'DEVICE_REGISTER':
      return serial
        ? `기기 시리얼 ${serial}이 등록되었습니다. (모델: ${
            details.model || 'N/A'
          })`
        : `기기 등록 (시리얼 정보 없음)`;
    case 'DEVICE_DELETE':
      return serial
        ? `기기 시리얼 ${serial}이 삭제되었습니다.`
        : `기기 삭제 (시리얼 정보 없음)`;
    case 'LOGIN':
      return `사용자 ${userName || 'N/A'} 님이 로그인했습니다.`;
    case 'LOGOUT':
      return `사용자 ${userName || 'N/A'} 님이 로그아웃했습니다.`;

    default:
      const detailStr = details ? JSON.stringify(details) : '상세 정보 없음';
      return detailStr.length > 100
        ? `${detailStr.substring(0, 100)}...`
        : detailStr;
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
      const res = await fetch(
        `/api/admin/audit-log?startDate=${start}&endDate=${end}`
      );
      if (!res.ok) {
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
    if (
      status === 'authenticated' &&
      (session?.user?.role === 'MASTER' || session?.user?.role === 'ADMIN')
    ) {
      fetchLogs(startDate, endDate);
    }
  }, [session, status, startDate, endDate, fetchLogs]);

  // 3. 렌더링 - 권한 및 로딩 체크
  // @ts-ignore
  if (
    status === 'loading' ||
    !(session?.user?.role === 'MASTER' || session?.user?.role === 'ADMIN')
  ) {
    return <div>접근 권한이 없거나 로딩 중입니다.</div>;
  }

  return (
    <div style={{ padding: '30px', maxWidth: '1000px', margin: '0 auto' }}>
      <h1
        style={{
          fontSize: '24px',
          fontWeight: 'bold',
          borderBottom: '2px solid #333',
          paddingBottom: '10px',
        }}
      >
        관리자({session.user.role}) 활동 감사 로그
      </h1>

      {/* 날짜 필터링 컴포넌트 */}
      <div
        style={{
          margin: '20px 0',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
        }}
      >
        <label>날짜 범위:</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={{
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        />
        <span>~</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          style={{
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        />
      </div>

      {loading && <div>로그를 불러오는 중...</div>}

      {!loading && (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: '10px',
          }}
        >
          <thead>
            <tr>
              <th style={{ border: '1px solid #ccc', padding: '10px' }}>
                날짜/시간
              </th>
              <th style={{ border: '1px solid #ccc', padding: '10px' }}>
                액션
              </th>
              <th style={{ border: '1px solid #ccc', padding: '10px' }}>
                상세
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  style={{
                    border: '1px solid #ccc',
                    padding: '10px',
                    textAlign: 'center',
                  }}
                >
                  선택된 기간에 기록된 활동 로그가 없습니다.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const style = getLogStyle(log.action);

                // ⭐️ [DATE FIX] Invalid Date 해결: 안전하게 파싱
                const logDate = safeParseDate(log.createdAt);

                return (
                  <tr key={log.id} style={{ backgroundColor: style.bg }}>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '10px',
                        fontSize: '14px',
                      }}
                    >
                      {logDate && !isNaN(logDate.getTime())
                        ? format(logDate, 'yyyy. MM. dd. HH:mm')
                        : 'N/A'}
                    </td>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '10px',
                        fontWeight: 'bold',
                        color: style.color,
                      }}
                    >
                      {style.label} ({log.action})
                    </td>
                    {/* ⭐️ [MESSAGE FIX] 포맷팅 함수에 log 전체 객체 전달 */}
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '10px',
                        fontSize: '12px',
                      }}
                    >
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
