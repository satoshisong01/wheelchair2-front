'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
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
  category?: string; // 🔒 [uc_log_01] 감사 범주 (API가 이전 기록도 채워서 반환)
  outcome?: string; // 🔒 [uc_log_01] 결과 SUCCESS / FAILURE
  [key: string]: any;
}

const PAGE_SIZE = 50; // API 상한(100) 이하

// ------------------------------------------------
// 2. 헬퍼 함수들
// ------------------------------------------------

const safeParseDate = (dateString: string) => {
  if (!dateString) return null;

  // 1. 문자열에 'Z'나 '+' (시차 정보)가 있는지 확인
  // (서버 환경에서는 보통 'Z'가 붙어서 옵니다)
  const isISOFormat = dateString.includes('Z') || dateString.includes('+');

  if (isISOFormat) {
    // [Case A] 서버: 이미 Z가 붙어있음 -> 브라우저가 알아서 한국 시간으로 잘 바꿈
    // 여기서 9시간을 더하면 '미래'로 가버리므로, 그냥 그대로 씁니다.
    let date = new Date(dateString);
    if (isNaN(date.getTime())) date = toDate(dateString);
    return date;
  } else {
    // [Case B] 로컬: Z가 없음 -> 브라우저가 7시를 그냥 7시로 착각함
    // 그러므로 강제로 9시간을 더해줘서 16시로 맞춰줍니다.
    let date = new Date(dateString);
    if (isNaN(date.getTime())) date = toDate(dateString);

    // 9시간 더하기 (밀리초 연산)
    return new Date(date.getTime() + 9 * 60 * 60 * 1000);
  }
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
  // 🔒 [uc_log_01] 기록은 되지만 화면에서 빠져 있던 이벤트 + 신규 감사 이벤트
  DEVICE_UPDATE: { color: '#17a2b8', label: '기기 수정', bg: '#e8f7fa' },
  DEVICE_NOTIFICATION_TOGGLE: { color: '#6f42c1', label: '알림 설정 변경', bg: '#f3eefc' },
  DEVICE_NOTIFICATION_INIT: { color: '#6f42c1', label: '알림 초기 설정', bg: '#f3eefc' },
  USER_ROLE_UPDATE: { color: '#fd7e14', label: '회원 역할 변경', bg: '#fff4e6' },
  USER_ROLE_UPDATE_FAILED: { color: '#dc3545', label: '역할 변경 실패', bg: '#f8d7da' },
  USER_DELETE: { color: '#dc3545', label: '회원 삭제', bg: '#f8d7da' },
  USER_SIGNUP: { color: '#007bff', label: '회원 가입', bg: '#e9f7ff' },
  USER_REAPPLY: { color: '#007bff', label: '가입 재신청', bg: '#e9f7ff' },
  DEVICE_REGISTER_FAILED: { color: '#dc3545', label: '기기 등록 실패', bg: '#f8d7da' },
  DEVICE_DELETE_FAILED: { color: '#dc3545', label: '기기 삭제 실패', bg: '#f8d7da' },
  USER_SETTINGS_UPDATE: { color: '#6f42c1', label: '사용자 설정 변경', bg: '#f3eefc' },
  LOGIN_FAILED: { color: '#dc3545', label: '로그인 실패', bg: '#f8d7da' },
  ACCOUNT_LOCKED: { color: '#dc3545', label: '계정 잠금', bg: '#f8d7da' },
  ACCESS_DENIED: { color: '#dc3545', label: '접근 거부', bg: '#f8d7da' },
  ALARM_RESOLVE: { color: '#28a745', label: '알람 확인', bg: '#e6ffed' },
  MAINTENANCE_CREATE: { color: '#17a2b8', label: '정비 이력 등록', bg: '#e8f7fa' },
  AI_QUERY: { color: '#495057', label: 'AI 질의', bg: '#f1f3f5' },
  AUDIT_LOG_VIEW: { color: '#495057', label: '감사로그 열람', bg: '#f1f3f5' },
  BANNER_UPDATE: { color: '#6f42c1', label: '알림 문구 변경', bg: '#f3eefc' },
  DEFAULT: { color: '#000', label: '기타 활동', bg: '#fff' },
};

// 🔒 [uc_log_01] 감사 범주 표시 라벨 (lib/log.ts AuditCategory)
const CATEGORY_LABELS: Record<string, string> = {
  ACCESS_CONTROL: '접근통제',
  REQUEST_ERROR: '요청오류',
  DEVICE: '의료기기',
  BACKUP_RECOVERY: '백업·복구',
  CONFIG_CHANGE: '설정변경',
  AUDIT_ACCESS: '감사접근',
  SYSTEM: '시스템',
  OTHER: '기타',
};

const getLogStyle = (action: string) => {
  // 라벨이 없는 새 이벤트도 구분되도록 action 코드를 그대로 표시
  return (
    LOG_CONFIG[action as keyof typeof LOG_CONFIG] || {
      ...LOG_CONFIG.DEFAULT,
      label: action || LOG_CONFIG.DEFAULT.label,
    }
  );
};

// 숫자·객체가 와도 화면이 깨지지 않도록 문자열로 바꿔 자름
const toText = (value: unknown, max: number): string => {
  if (value === null || value === undefined || value === '') return 'N/A';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.substring(0, max)}...` : text;
};

const onOff = (value: unknown): string => (value ? 'ON' : 'OFF');

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
    case 'SERVER_ALERT': {
      const reasonText = details.reason || '시스템 부하 경고';
      const cpu = details.cpu_usage || 'N/A';
      const memory = details.memory_free || 'N/A';
      const serverId = log.device_serial || 'N/A';
      // 서버 모니터는 process_snapshot 키로 저장(구 process_info) — 배열·객체여도 화면이 깨지지 않게 문자열화
      const snapshot = details.process_snapshot ?? details.process_info;
      return (
        <>
          서버 (<Name name={serverId} />
          )에서 **{reasonText}** 감지. (CPU: {cpu}%, RAM Free: {memory} GB)
          <span style={{ color: '#aaa', fontSize: '0.9em', display: 'block' }}>
            프로세스 스냅샷: {snapshot ? toText(snapshot, 100) : '없음'}
          </span>
        </>
      );
    }
    case 'DEVICE_UPDATE':
      return (
        <>
          <Name name={userName} /> 님이 기기 정보 수정 (S/N: {toText(serial, 30)}, ID:{' '}
          {toText(details.wheelchairId, 8)})
        </>
      );
    case 'DEVICE_NOTIFICATION_TOGGLE':
      return (
        <>
          <Name name={displayActorName} /> 님이 기기 알림 설정 변경 (ID:{' '}
          {toText(details.wheelchairId, 8)}, {toText(details.type, 20)}: {onOff(details.enabled)})
        </>
      );
    case 'DEVICE_NOTIFICATION_INIT':
      return (
        <>
          <Name name={userName} /> 님이 기기 알림 초기 설정 (ID: {toText(details.wheelchairId, 8)},
          응급 {onOff(details.emergency)} · 배터리 {onOff(details.battery)} · 자세{' '}
          {onOff(details.posture)})
        </>
      );
    case 'USER_ROLE_UPDATE':
      return (
        <>
          <Name name={userName} /> 님이 회원({toText(targetUserName, 20)}) 역할을{' '}
          {toText(details.newRole, 20)}(으)로 변경.
        </>
      );
    case 'USER_DELETE':
      return (
        <>
          <Name name={userName} /> 님이 회원({toText(targetUserName, 20)}) 삭제.
        </>
      );
    case 'AUDIT_LOG_VIEW':
      if (log.outcome === 'FAILURE') {
        return (
          <>
            {log.user_role} <Name name={displayActorName} /> 감사 로그 열람 실패 (사유:{' '}
            {toText(details.reason, 30)})
          </>
        );
      }
      return (
        <>
          <Name name={userName} /> 님이 감사 로그 열람 ({toText(details.startDate, 10)} ~{' '}
          {toText(details.endDate, 10)}, {toText(details.page, 6)}페이지, {toText(details.resultCount, 6)}
          건)
        </>
      );
    case 'BANNER_UPDATE':
      if (log.outcome === 'FAILURE') {
        return (
          <>
            {log.user_role} <Name name={displayActorName} /> 로그인 화면 알림 문구 변경 실패 (사유:{' '}
            {toText(details.reason, 30)})
          </>
        );
      }
      return (
        <>
          <Name name={userName} /> 님이 로그인 화면 알림 문구 변경
          <span style={{ color: '#aaa', fontSize: '0.9em', display: 'block' }}>
            변경 후: {toText(details.after, 100)}
          </span>
        </>
      );
    default: {
      // 문구가 정해지지 않은 이벤트도 행위자(출처)와 상세를 보여 줌 (범주·결과는 별도 열)
      const rest = Object.fromEntries(
        Object.entries(details).filter(([key]) => key !== 'category' && key !== 'outcome'),
      );
      const detailStr = typeof details.text === 'string' ? details.text : JSON.stringify(rest);
      return (
        <span>
          {log.user_role} <Name name={displayActorName} /> · {toText(detailStr, 100)}
        </span>
      );
    }
  }
};

// ------------------------------------------------
// 3. 메인 컴포넌트
// ------------------------------------------------
export default function AuditLogPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  // 🔒 [uc_log_06] 감사로그 열람은 MASTER 전용 (API·메뉴와 동일)
  const isMaster = session?.user?.role === 'MASTER';

  const today = new Date().toISOString().split('T')[0];
  const initialStartDate = new Date();
  initialStartDate.setDate(initialStartDate.getDate() - 30);

  const [startDate, setStartDate] = useState(initialStartDate.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // FCM_SEND(워커 푸시 발송 기록)는 양이 많아 기본 목록에서 빼고, 체크하면 함께 보여 줌
  const [includeFcm, setIncludeFcm] = useState(false);
  // 페이지 넘김 기준 시각(첫 조회 응답의 asOf) — 날짜·필터를 바꾸거나 '조회'를 누르면 비워서 새로 정한다
  const asOfRef = useRef<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // includeFcm이 바뀌면 fetchLogs도 바뀌어 아래 useEffect가 1페이지부터 다시 조회
  const fetchLogs = useCallback(async (start: string, end: string, pageNo: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: start,
        endDate: end,
        page: String(pageNo),
        pageSize: String(PAGE_SIZE),
        includeFcm: includeFcm ? 'true' : 'false',
      });
      if (asOfRef.current) params.set('asOf', asOfRef.current);
      const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
      if (!res.ok) {
        const errorBody = await res.json();
        console.error('Failed to fetch logs:', errorBody);
        alert(`로그를 불러오는 데 실패했습니다: ${errorBody.message || res.statusText}`);
        setLogs([]);
        setTotal(0);
        return;
      }
      const data = await res.json();
      // 🔒 [uc_log_06] 다음 페이지도 같은 기준 시각으로 조회 — 열람 기록 등 새 행 때문에 목록이 밀리지 않게
      asOfRef.current = typeof data.asOf === 'string' ? data.asOf : null;
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setTotal(Number(data.total) || 0);
    } catch (error) {
      console.error('Error fetching logs:', error);
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [includeFcm]);

  // 세션 객체 대신 역할만 의존 — 창 포커스마다 세션이 갱신돼 열람 기록이 중복되지 않게.
  // 날짜를 고치는 중(빈 값·시작>종료)에는 자동 조회하지 않음 ('조회' 버튼은 서버 검증 안내를 그대로 표시)
  useEffect(() => {
    if (status === 'authenticated' && isMaster && startDate && endDate && startDate <= endDate) {
      fetchLogs(startDate, endDate, page);
    }
  }, [status, isMaster, startDate, endDate, page, fetchLogs]);

  if (status === 'loading') {
    return <LoadingSpinner />;
  }

  if (!isMaster) {
    return <div className="p-8 text-center">접근 권한이 없습니다.</div>;
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>관리자({session.user.role}) 활동 감사 로그</h1>

      {/* 🔒 [uc_auth_11] 로그인 화면 사용 알림 문구 설정(MASTER) — 감사로그 화면 자체는 읽기 전용 유지 */}
      <Link href="/admin-portal/settings" className={styles.settingsLink}>
        ⚙️ 로그인 화면 알림 문구 설정
      </Link>

      <div className={styles.dateFilterSection}>
        <label className={styles.filterLabel}>날짜 범위:</label>
        <div className={styles.dateInputGroup}>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
              asOfRef.current = null;
            }}
            className={styles.dateInput}
          />
          <span className={styles.separator}>~</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
              asOfRef.current = null;
            }}
            className={styles.dateInput}
          />
          <button
            style={{
              border: 'solid 2px black',
              padding: '5px',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
            onClick={() => {
              asOfRef.current = null; // '조회'는 새로 생긴 기록까지 다시 불러옴
              fetchLogs(startDate, endDate, page);
            }}
            className={styles.searchButton}
            disabled={loading}
          >
            조회
          </button>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            <input
              type="checkbox"
              checked={includeFcm}
              onChange={(e) => {
                setIncludeFcm(e.target.checked);
                setPage(1);
                asOfRef.current = null;
              }}
            />
            푸시 발송 기록(FCM_SEND) 포함
          </label>
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
                <th className={styles.thOutcome}>결과</th>
                <th className={styles.thDetails}>상세</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.emptyCell}>
                    선택된 기간에 기록된 활동 로그가 없습니다.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const style = getLogStyle(log.action);
                  // 🟢 여기서 수정된 safeParseDate 함수 호출
                  const logDate = safeParseDate(log.created_at);
                  const isFailure = log.outcome === 'FAILURE';

                  return (
                    <tr key={log.id} style={{ backgroundColor: style.bg }}>
                      <td className={styles.tdDate}>
                        {logDate && !isNaN(logDate.getTime())
                          ? format(logDate, 'yyyy. MM. dd. HH:mm', {
                              locale: ko,
                            })
                          : 'N/A'}
                        {/* 🔒 [uc_log_01] 이벤트 ID */}
                        <span className={styles.subText}>#{log.id}</span>
                      </td>
                      <td className={styles.tdAction} style={{ color: style.color }}>
                        {style.label}
                        {/* 🔒 [uc_log_01] 감사 범주 */}
                        <span className={styles.subText}>
                          {CATEGORY_LABELS[log.category ?? ''] ?? log.category ?? ''}
                        </span>
                      </td>
                      <td
                        className={styles.tdOutcome}
                        style={{ color: isFailure ? '#dc3545' : '#28a745' }}
                      >
                        {isFailure ? '실패' : '성공'}
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

      {/* 🔒 [uc_log_06] 페이지 이동 (한 번에 PAGE_SIZE건) */}
      {!loading && total > 0 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageButton}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            이전
          </button>
          <span className={styles.pageInfo}>
            {page} / {totalPages} 페이지 (총 {total}건)
          </span>
          <button
            className={styles.pageButton}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
