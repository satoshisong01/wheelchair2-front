'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
// 🟢 [수정] addHours 다시 추가 (UTC -> KST 수동 변환용)
import { format, toDate, addHours } from 'date-fns';
import { ko } from 'date-fns/locale/ko';
import styles from './page.module.css';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// ------------------------------------------------
// 1. 데이터 타입 정의
// ------------------------------------------------
interface AuditLog {
  id: string;
  user_id: string;
  user_role: string;
  action: string;
  details: string | any;
  user_name?: string;
  created_at: string; // UTC 시간 (예: 2026-01-29 06:59:00)
  device_serial?: string;
  [key: string]: any;
}

// ------------------------------------------------
// 2. 헬퍼 함수들
// ------------------------------------------------

const safeParseDate = (dateString: string) => {
  if (!dateString) return null;

  // 1. 일단 날짜 객체로 만듭니다.
  let date = new Date(dateString);

  // 파싱 실패시 date-fns 도움 받기
  if (isNaN(date.getTime())) {
    date = toDate(dateString);
  }
  if (isNaN(date.getTime())) return null;

  // 2. [강력한 해결책]
  // 현재 이 date 객체가 몇 시로 인식되든 상관없이,
  // 무조건 9시간(32,400,000ms)을 더해서 미래로 보내버립니다.
  // 예: 07:00 -> 16:00
  const targetTime = date.getTime() + 9 * 60 * 60 * 1000;

  return new Date(targetTime);
};

const LOG_CONFIG = {
  LOGIN: { color: '#007bff', label: '로그인', bg: '#e9f7ff' },
  LOGOUT: { color: '#6c757d', label: '로그아웃', bg: '#f8f9fa' },
  DEVICE_REGISTER: { color: '#28a745', label: '기기 등록', bg: '#e6ffed' },
  DEVICE_DELETE: { color: '#dc3545', label: '기기 삭제', bg: '#f8d7da' },
  USER_UPDATE: { color: '#ffc107', label: '정보 수정', bg: '#fff3cd' },
  USER_APPROVE: { color: '#79aa1d', label: '관리자 승인', bg: '#e6ffed' },
  USER_REJECT: { color: '#dc3545', label: '관리자 거절', bg: '#f8d7da' },
  SERVER_ALERT: { color: '#ff0000', label: '🚨 서버 경고', bg: '#ffebe9' },
  DEFAULT: { color: '#000', label: '기타 활동', bg: '#fff' },
};

const getLogStyle = (action: string) => {
  return LOG_CONFIG[action as keyof typeof LOG_CONFIG] || LOG_CONFIG.DEFAULT;
};

// 이름을 강조하는 컴포넌트
const Name = ({ name }: { name: string }) => <strong style={{ fontWeight: 'bold' }}>{name}</strong>;

// 로그 메시지 포맷팅 로직
const formatLogContent = (log: AuditLog) => {
  let details: any;
  try {
    details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
  } catch (e) {
    details = { text: log.details || '상세 정보 없음' };
  }
  details = details || {};

  const userName = log.user_name || 'N/A';
  const action = log.action;
  const serial = details?.serial || details?.deviceSerial || log.device_serial;
  const model = details?.model || 'N/A';
  const wcId = details?.wheelchairId || 'N/A';
  const targetUserId = details?.targetUserId || 'N/A';
  const targetUserName = details.targetUserName || details.targetUserEmail || targetUserId;
  const reason = details?.reason || '없음';

  // 기기 사용자일 경우 이름 대신 시리얼 넘버 사용
  const isDeviceUserLog = log.user_role === 'DEVICE_USER';
  const displayActorName = isDeviceUserLog ? serial || '알 수 없는 기기' : userName;

  switch (action) {
    case 'DEVICE_REGISTER':
      return (
        <>
          <Name name={userName} /> 님이 기기 등록 (S/N: {serial}, 모델: {model}, ID:{' '}
          {wcId.substring(0, 8)})
        </>
      );
    case 'DEVICE_DELETE':
      return (
        <>
          <Name name={userName} /> 님이 기기 삭제 (S/N: {serial}, 모델: {model}, ID:{' '}
          {wcId.substring(0, 8)})
        </>
      );
    case 'LOGIN':
    case 'LOGOUT':
      if (isDeviceUserLog) {
        return (
          <>
            기기 (<Name name={displayActorName} />
            )에서 {action.toLowerCase()}
            했습니다.
          </>
        );
      }
      return (
        <>
          {log.user_role} <Name name={displayActorName} /> 님이 {action.toLowerCase()}했습니다.
        </>
      );
    case 'USER_UPDATE':
      if (isDeviceUserLog) {
        return (
          <>
            기기 사용자 (<Name name={displayActorName} />
            )의 비밀번호가 변경되었습니다.
          </>
        );
      }
      return <>기기 사용자({details.deviceId || 'N/A'}) 비밀번호 변경 완료.</>;
    case 'USER_APPROVE':
      return (
        <>
          <Name name={userName} /> 님이 회원({targetUserName.substring(0, 20)}) 관리자(ADMIN) 역할로
          승인.
        </>
      );
    case 'USER_REJECT':
      return (
        <>
          <Name name={userName} /> 님이 회원({targetUserName.substring(0, 20)}) 가입 거절. (사유:{' '}
          {reason.substring(0, 50)})
        </>
      );
    case 'SERVER_ALERT':
      const reasonText = details.reason || '시스템 부하 경고';
      const cpu = details.cpu_usage || 'N/A';
      const memory = details.memory_free || 'N/A';
      const serverId = log.device_serial || 'N/A';
      return (
        <>
          서버 (<Name name={serverId} />
          )에서 **{reasonText}** 감지. (CPU: {cpu}%, RAM Free: {memory} GB)
          <span style={{ color: '#aaa', fontSize: '0.9em', display: 'block' }}>
            프로세스 스냅샷:{' '}
            {details.process_info ? details.process_info.substring(0, 100) : '없음'}...
          </span>
        </>
      );
    default:
      const detailStr = details.text || JSON.stringify(details);
      return (
        <span>{detailStr.length > 100 ? `${detailStr.substring(0, 100)}...` : detailStr}</span>
      );
  }
};

// ------------------------------------------------
// 3. 메인 컴포넌트
// ------------------------------------------------
export default function AuditLogPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const today = new Date().toISOString().split('T')[0];
  const initialStartDate = new Date();
  initialStartDate.setDate(initialStartDate.getDate() - 30);

  const [startDate, setStartDate] = useState(initialStartDate.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/audit-log?startDate=${start}&endDate=${end}`);
      if (!res.ok) {
        const errorBody = await res.json();
        console.error('Failed to fetch logs:', errorBody);
        alert(`로그를 불러오는 데 실패했습니다: ${errorBody.message || res.statusText}`);
        setLogs([]);
        return;
      }
      const data = await res.json();
      setLogs(data);
    } catch (error) {
      console.error('Error fetching logs:', error);
      setLogs([]);
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
      <h1 className={styles.pageTitle}>관리자({session.user.role}) 활동 감사 로그</h1>

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
          <button
            onClick={() => fetchLogs(startDate, endDate)}
            className={styles.searchButton}
            disabled={loading}
          >
            조회
          </button>
        </div>
      </div>

      {loading && <div className={styles.loadingText}>로그를 불러오는 중...</div>}

      {!loading && (
        <div className={styles.tableScrollContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thDate}>날짜/시간 (KST)</th>
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
                  // 🟢 여기서 수정된 safeParseDate 함수 호출
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
                      <td className={styles.tdAction} style={{ color: style.color }}>
                        {style.label}
                      </td>
                      <td className={styles.tdDetails}>{formatLogContent(log)}</td>
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
