'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { User } from '@/entities/User';
import { AdminAuditLogAction } from '@/entities/AdminAuditLog';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import DateRangePicker from '../../../components/ui/DateRangePicker';

// ‼️ API로부터 받아올 로그 목록의 상세 타입 정의
type AuditLogView = {
  id: number;
  timestamp: string; // (JSON은 Date를 string으로 직렬화)
  actionType: AdminAuditLogAction;
  details: string;
  adminUserId: number;
  adminUser: Pick<User, 'id' | 'name' | 'email'>;
};

// [헬퍼 함수] 로그 타입(Enum)을 한국어로 변환
const formatLogAction = (action: AdminAuditLogAction): string => {
  switch (action) {
    case AdminAuditLogAction.LOGIN:
      return '로그인';
    case AdminAuditLogAction.LOGOUT:
      return '로그아웃';
    case AdminAuditLogAction.DEVICE_CREATE:
      return '기기 등록';
    case AdminAuditLogAction.DEVICE_DELETE:
      return '기기 삭제';
    case AdminAuditLogAction.ADMIN_APPROVE:
      return '관리자 승인';
    case AdminAuditLogAction.ADMIN_REJECT:
      return '관리자 거부';
    default:
      return action;
  }
};

// 💡 날짜를 YYYY-MM-DD 형식으로 반환하는 헬퍼 함수
const formatDateString = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function AuditLogPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [logs, setLogs] = useState<AuditLogView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 🟢 [상태 1] 날짜 범위 (초기값: 오늘)
  const today = new Date();
  const [startDate, setStartDate] = useState<Date>(today);
  const [endDate, setEndDate] = useState<Date>(today);

  // 🟢 [상태 2] 지연 검색 트리거 (검색 버튼용)
  const [searchTrigger, setSearchTrigger] = useState(0);

  // 🟢 [상태 3] 정렬 순서 ('DESC': 최신순, 'ASC': 과거순)
  const [sortOrder, setSortOrder] = useState<'DESC' | 'ASC'>('DESC');

  // 🟢 [상태 4] 로그가 존재하는 날짜 목록
  const [loggedDates, setLoggedDates] = useState<string[]>([]);

  // 2. [로직] 데이터 Fetching (검색 또는 정렬 변경 시 실행)
  useEffect(() => {
    if (status === 'authenticated' && session.user.role === 'MASTER') {
      const startStr = formatDateString(startDate);
      const endStr = formatDateString(endDate);

      const fetchLogs = async () => {
        setIsLoading(true);
        try {
          // 🟢 API 호출 (날짜 범위 + 정렬 순서 포함)
          const res = await fetch(
            `/api/admin/audit-log?startDate=${startStr}&endDate=${endStr}&sort=${sortOrder}`
          );

          if (!res.ok) {
            throw new Error('감사 로그를 불러오는 데 실패했습니다.');
          }

          // 🚨 [에러 해결 포인트] 받아온 데이터를 타입 단언(Type Assertion)으로 명확히 지정
          const data: AuditLogView[] = await res.json();

          // 🟢 [수정된 부분] 로그 목록에서 날짜 추출 (타입 안정성 확보)
          const dates = Array.from(
            new Set(
              data.map((log) => formatDateString(new Date(log.timestamp)))
            )
          );
          setLoggedDates(dates);

          setLogs(data);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setIsLoading(false);
        }
      };

      fetchLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session, searchTrigger, sortOrder]); // sortOrder가 바뀌면 즉시 재검색

  // 🟢 검색 버튼 핸들러
  const handleSearch = () => {
    setSearchTrigger((prev) => prev + 1);
  };

  // 🟢 정렬 토글 핸들러
  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'DESC' ? 'ASC' : 'DESC'));
    // 정렬 변경은 useEffect 의존성 배열에 의해 자동으로 fetch를 트리거함
  };

  // 3. [UI] 로딩 및 에러 처리
  if (isLoading || status === 'loading') {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>오류 발생</h1>
        <p className={styles.error}>{error}</p>
      </div>
    );
  }

  if (status !== 'authenticated' || session.user.role !== 'MASTER') {
    return null;
  }

  // 4. [UI] 메인 렌더링
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>감사 로그 (MASTER)</h1>
      <p className={styles.subtitle}>
        관리자 활동 이력이{' '}
        <strong>{sortOrder === 'DESC' ? '최신순' : '과거순'}</strong>으로
        표시됩니다.
      </p>

      {/* 필터 및 컨트롤 영역 */}
      <div className={styles.dateFilterContainer}>
        <div className={styles.filterHeader}>로그 조회 기간</div>
        <div className={styles.filterControls}>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChangeStart={setStartDate}
            onChangeEnd={setEndDate}
            loggedDates={loggedDates}
          />

          {/* 검색 버튼 */}
          <button onClick={handleSearch} className={styles.searchButton}>
            검색
          </button>

          {/* 정렬 토글 버튼 */}
          <button onClick={toggleSortOrder} className={styles.sortButton}>
            {sortOrder === 'DESC' ? '⬇️ 최신순' : '⬆️ 과거순'}
          </button>
        </div>

        <p className={styles.note}>
          * 조회 기간: {formatDateString(startDate)} ~{' '}
          {formatDateString(endDate)}
        </p>
      </div>

      {/* 테이블 영역 */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>로그 ID</th>
              <th>시간 (Timestamp)</th>
              <th>수행 관리자</th>
              <th>활동 유형</th>
              <th>상세 내용 (Details)</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.emptyCell}>
                  기록된 로그가 없습니다.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.id}</td>
                  <td>
                    {new Date(log.timestamp).toLocaleString('ko-KR', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td>
                    {log.adminUser.name || 'N/A'}
                    <span className={styles.email}>
                      ({log.adminUser.email || 'N/A'})
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.logType} ${
                        styles[log.actionType.toLowerCase()]
                      }`}
                    >
                      {formatLogAction(log.actionType)}
                    </span>
                  </td>
                  <td className={styles.detailsCell}>{log.details}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
