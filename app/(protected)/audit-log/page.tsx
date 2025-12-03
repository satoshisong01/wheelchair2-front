'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
// ⚠️ npm install date-fns 필요
import { format } from 'date-fns';
import { ko } from 'date-fns/locale/ko';
import styles from './page.module.css';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// ------------------------------------------------
// 1. 데이터 타입 정의
// ------------------------------------------------
interface AuditLog {
  id: string;
  admin_user_id: string;
  user_id: string;
  userRole: string;
  action: string;
  details: string | any;
  user_name?: string;
  userName?: string;
  createdAt: string;
  created_at: string;
  device_serial?: string;
  [key: string]: any;
}

// ------------------------------------------------
// 2. 헬퍼 함수들
// ------------------------------------------------
const safeParseDate = (dateString: string) => {
  if (!dateString) return null;
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
  ADMIN_APPROVE: { color: '#28a745', label: '관리자 승인', bg: '#e6ffed' },
  ADMIN_REJECT: { color: '#dc3545', label: '관리자 거절', bg: '#f8d7da' },
  DEFAULT: { color: '#000', label: '기타 활동', bg: '#fff' },
};

const getLogStyle = (action: string) => {
  return LOG_CONFIG[action as keyof typeof LOG_CONFIG] || LOG_CONFIG.DEFAULT;
};

const formatLogMessage = (log: AuditLog) => {
  let details: any;
  try {
    details = JSON.parse(log.details) || {};
  } catch (e) {
    details = { text: log.details || '상세 정보 없음' };
  }

  const action = log.action || log.action_type;
  const serial = details?.serial || details?.deviceSerial;
  const userName = log.userName || log.user_name || 'N/A';
  const model = details?.model || 'N/A';

  switch (action) {
    case 'DEVICE_REGISTER':
      return serial
        ? `기기 등록 (S/N: ${serial}, 모델: ${model})`
        : `기기 등록 (시리얼 정보 없음)`;
    case 'DEVICE_DELETE':
      return serial
        ? `기기 삭제 (S/N: ${serial} 삭제 완료)`
        : `기기 삭제 (시리얼 정보 없음)`;
    case 'LOGIN':
    case 'LOGOUT':
      return `관리자 ${userName} 님이 ${action.toLowerCase()}했습니다.`;
    default:
      const detailStr = details.text || JSON.stringify(details);
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

  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    // @ts-ignore
    if (
      status === 'authenticated' &&
      (session?.user?.role === 'MASTER' || session?.user?.role === 'ADMIN')
    ) {
      fetchLogs(startDate, endDate);
    }
  }, [session, status, startDate, endDate, fetchLogs]);

  // @ts-ignore
  if (
    status === 'loading' ||
    !(session?.user?.role === 'MASTER' || session?.user?.role === 'ADMIN')
  ) {
    return <LoadingSpinner />;
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>
        관리자({session.user.role}) 활동 감사 로그
      </h1>

      {/* 🟢 [수정] 날짜 필터 영역 (CSS 클래스 적용) */}
      <div className={styles.dateFilterSection}>
        <label className={styles.filterLabel}>날짜 범위:</label>
        <div className={styles.dateInputGroup}>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={styles.dateInput}
          />
          <span className={styles.separator}>~</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={styles.dateInput}
          />
        </div>
      </div>

      {loading && (
        <div className={styles.loadingText}>로그를 불러오는 중...</div>
      )}

      {!loading && (
        // 🟢 [수정] 테이블 가로 스크롤을 위한 컨테이너 적용
        <div className={styles.tableScrollContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thDate}>날짜/시간</th>
                <th className={styles.thAction}>액션</th>
                <th className={styles.thDetails}>상세</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={3} className={styles.emptyCell}>
                    선택된 기간에 기록된 활동 로그가 없습니다.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const style = getLogStyle(log.action);
                  const logDate = safeParseDate(log.created_at);

                  return (
                    <tr key={log.id} style={{ backgroundColor: style.bg }}>
                      <td className={styles.tdDate}>
                        {logDate && !isNaN(logDate.getTime())
                          ? format(logDate, 'yyyy. MM. dd. HH:mm', {
                              locale: ko,
                            })
                          : 'N/A'}
                      </td>
                      <td
                        className={styles.tdAction}
                        style={{ color: style.color }}
                      >
                        {style.label}
                      </td>
                      <td className={styles.tdDetails}>
                        {formatLogMessage(log)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
