'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface WheelchairOption {
  id: string;
  device_serial: string;
  modelName?: string;
}

interface UlcerDayRow {
  date: string;
  count: number;
}

function formatDateStr(d: string) {
  if (!d) return '-';
  // API에서 "2025-03-15" 또는 "2025-03-15T00:00:00.000Z" 형태로 올 수 있음
  const dateOnly = typeof d === 'string' && d.includes('T') ? d.slice(0, 10) : d;
  const [y, m, day] = dateOnly.split('-');
  const month = Number(m);
  const dayNum = Number(day);
  if (Number.isNaN(month) || Number.isNaN(dayNum)) return dateOnly;
  return `${y}. ${month}. ${dayNum}`;
}

export default function UlcerAlertsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isManager =
    (session?.user as any)?.role === 'ADMIN' || (session?.user as any)?.role === 'MASTER';

  const [wheelchairs, setWheelchairs] = useState<WheelchairOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const today = new Date();
  const [fromDate, setFromDate] = useState<string>(
    new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  );
  const [toDate, setToDate] = useState<string>(today.toISOString().slice(0, 10));
  const [rows, setRows] = useState<UlcerDayRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchWheelchairs = useCallback(async () => {
    try {
      const res = await fetch('/api/wheelchairs');
      if (!res.ok) return;
      const data = await res.json();
      const list = (Array.isArray(data) ? data : []).map((w: any) => ({
        id: String(w.id),
        device_serial: w.device_serial || `기기 ${w.id}`,
        modelName: w.modelName ?? w.model_name,
      }));
      setWheelchairs(list);
      if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
    } catch (e) {
      console.error('Failed to fetch wheelchairs', e);
    }
  }, [selectedId]);

  useEffect(() => {
    if (status === 'authenticated' && isManager) fetchWheelchairs();
  }, [status, isManager, fetchWheelchairs]);

  const handleSearch = useCallback(async () => {
    if (!selectedId || !fromDate || !toDate) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        wheelchairId: selectedId,
        from: fromDate,
        to: toDate,
      });
      const res = await fetch(`/api/admin/ulcer-history?${params}`);
      if (!res.ok) throw new Error('조회 실패');
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedId, fromDate, toDate]);

  if (status === 'loading' || !session) {
    return <LoadingSpinner />;
  }

  if (!isManager) {
    router.replace('/dashboard');
    return null;
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>욕창알림 내역</h1>
      <p className={styles.description}>
        기기를 선택하고 기간을 설정한 뒤 조회하면, 날짜별로 욕창 방지를 위해 35° 이상 2분 유지를
        몇 번 했는지 확인할 수 있습니다.
      </p>

      <div className={styles.filterSection}>
        <label className={styles.filterLabel}>기기</label>
        <select
          className={styles.selectInput}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">선택</option>
          {wheelchairs.map((w) => (
            <option key={w.id} value={w.id}>
              {w.device_serial}
              {w.modelName ? ` (${w.modelName})` : ''}
            </option>
          ))}
        </select>

        <label className={styles.filterLabel}>기간</label>
        <input
          type="date"
          className={styles.dateInput}
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <span className={styles.separator}>~</span>
        <input
          type="date"
          className={styles.dateInput}
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />
        <button
          type="button"
          className={styles.searchButton}
          onClick={handleSearch}
          disabled={loading || !selectedId}
        >
          검색
        </button>
      </div>

      {loading && <div className={styles.loadingText}>조회 중...</div>}

      {!loading && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thDate}>날짜</th>
                  <th className={styles.thCount}>욕창 방지 횟수 (35° 2분 유지)</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={2} className={styles.emptyCell}>
                      선택한 기간에 기록이 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.date}>
                      <td className={styles.tdDate}>{formatDateStr(r.date)}</td>
                      <td className={styles.tdCount}>{r.count}회</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.cardList}>
            {rows.length === 0 ? (
              <div className={styles.emptyCell}>선택한 기간에 기록이 없습니다.</div>
            ) : (
              rows.map((r) => (
                <div key={r.date} className={styles.cardItem}>
                  <span className={styles.cardDate}>{formatDateStr(r.date)}</span>
                  <span className={styles.cardCount}>{r.count}회</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
