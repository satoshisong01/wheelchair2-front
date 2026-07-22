'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import PostureEventAnglesModal from './PostureEventAnglesModal';

interface WheelchairOption {
  id: string;
  device_serial: string;
  modelName?: string;
}

interface DailyRow {
  wheelchair_id: string;
  device_serial: string;
  date: string;
  runtime_min: number | null;
  distance_m: number | null;
  latitude: number | null;
  longitude: number | null;
  ulcer_count: number;
}

// 필터 가능한 컬럼 키
type ColumnKey = 'runtime' | 'distance' | 'location' | 'ulcer';

const COLUMN_LABELS: Record<ColumnKey, string> = {
  runtime: '사용시간',
  distance: '주행거리',
  location: '위경도',
  ulcer: '욕창 방지 횟수',
};

function formatDateStr(d: string) {
  if (!d) return '-';
  const dateOnly = typeof d === 'string' && d.includes('T') ? d.slice(0, 10) : d;
  const [y, m, day] = dateOnly.split('-');
  const month = Number(m);
  const dayNum = Number(day);
  if (Number.isNaN(month) || Number.isNaN(dayNum)) return dateOnly;
  return `${y}. ${month}. ${dayNum}`;
}

function formatRuntime(min: number | null): string {
  if (min === null || min === undefined) return '-';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}분`;
  return `${h}시간 ${m}분`;
}

function formatDistance(m: number | null): string {
  if (m === null || m === undefined) return '-';
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

function formatLocation(lat: number | null, lon: number | null): string {
  if (lat === null || lon === null || lat === undefined || lon === undefined) return '-';
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

export default function DeviceUsagePage() {
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
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [isFullQuery, setIsFullQuery] = useState(false);
  const [loading, setLoading] = useState(false);
  // 욕창 방지 횟수 클릭 시 이벤트별 각도 확인 모달
  const [modalRow, setModalRow] = useState<DailyRow | null>(null);

  // 컬럼 필터: 기본은 전부 ON
  const [visibleCols, setVisibleCols] = useState<Record<ColumnKey, boolean>>({
    runtime: true,
    distance: true,
    location: true,
    ulcer: true,
  });

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

  const search = useCallback(
    async (full: boolean) => {
      if (!fromDate || !toDate) return;
      if (!full && !selectedId) return;

      setLoading(true);
      try {
        const params = new URLSearchParams({
          wheelchairId: full ? 'ALL' : selectedId,
          from: fromDate,
          to: toDate,
        });
        const res = await fetch(`/api/admin/wheelchair-daily-history?${params}`);
        if (!res.ok) throw new Error('조회 실패');
        const data = await res.json();
        setRows(Array.isArray(data) ? data : []);
        setIsFullQuery(full);
      } catch (e) {
        console.error(e);
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [selectedId, fromDate, toDate],
  );

  const handleColumnToggle = useCallback((col: ColumnKey) => {
    setVisibleCols((prev) => ({ ...prev, [col]: !prev[col] }));
  }, []);

  // 활성 컬럼 (체크된 것)
  const activeCols = useMemo(
    () => (Object.keys(visibleCols) as ColumnKey[]).filter((k) => visibleCols[k]),
    [visibleCols],
  );

  const handleExcelDownload = useCallback(() => {
    if (rows.length === 0) return;

    // 헤더: 기본 + 활성 컬럼
    const headerBase = isFullQuery ? ['기기', '날짜'] : ['날짜'];
    const headerCols = activeCols.map((c) => COLUMN_LABELS[c]);
    const header = [...headerBase, ...headerCols];

    const body = rows.map((r) => {
      const base = isFullQuery
        ? [r.device_serial, formatDateStr(r.date)]
        : [formatDateStr(r.date)];
      const cols: string[] = [];
      for (const c of activeCols) {
        if (c === 'runtime') cols.push(formatRuntime(r.runtime_min));
        else if (c === 'distance') cols.push(formatDistance(r.distance_m));
        else if (c === 'location') cols.push(formatLocation(r.latitude, r.longitude));
        else if (c === 'ulcer') cols.push(`${r.ulcer_count}회`);
      }
      return [...base, ...cols];
    });

    const selectedWheelchair = wheelchairs.find((w) => w.id === selectedId);
    const deviceLabel = isFullQuery
      ? '전체 기기'
      : selectedWheelchair
        ? `${selectedWheelchair.device_serial}${selectedWheelchair.modelName ? ` (${selectedWheelchair.modelName})` : ''}`
        : selectedId || '-';

    const metaCols = isFullQuery ? ['', '', ''] : ['', ''];
    const csvRows = [
      ['조회 대상', deviceLabel],
      ['기간', `${fromDate} ~ ${toDate}`],
      metaCols,
      header,
      ...body,
    ].map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
    );
    const csv = '﻿' + csvRows.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeLabel = deviceLabel.replace(/[/\\?%*:|"<>]/g, '_');
    a.download = `기기사용내역_${safeLabel}_${fromDate}_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, isFullQuery, activeCols, fromDate, toDate, selectedId, wheelchairs]);

  if (status === 'loading' || !session) {
    return <LoadingSpinner />;
  }

  if (!isManager) {
    router.replace('/dashboard');
    return null;
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>기기 사용 내역</h1>
      <p className={styles.description}>
        기기와 기간을 선택하고 조회하면 날짜별 사용시간, 주행거리, 위경도, 욕창 방지 횟수를 확인할 수 있습니다.
        체크박스로 표시할 항목을 선택할 수 있습니다.
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
          onClick={() => search(false)}
          disabled={loading || !selectedId}
        >
          검색
        </button>
        <button
          type="button"
          className={styles.searchButton}
          onClick={() => search(true)}
          disabled={loading || !fromDate || !toDate}
        >
          전체 조회
        </button>
      </div>

      {/* 컬럼 필터 (체크박스) */}
      {rows.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            padding: '12px 16px',
            marginTop: 12,
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 600, color: '#374151', fontSize: 14 }}>표시 항목:</span>
          {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((col) => (
            <label
              key={col}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                fontSize: 14,
                color: '#4b5563',
              }}
            >
              <input
                type="checkbox"
                checked={visibleCols[col]}
                onChange={() => handleColumnToggle(col)}
              />
              {COLUMN_LABELS[col]}
            </label>
          ))}
          <button
            type="button"
            className={styles.downloadButton}
            onClick={handleExcelDownload}
            style={{ marginLeft: 'auto' }}
          >
            엑셀 다운로드
          </button>
        </div>
      )}

      {loading && <div className={styles.loadingText}>조회 중...</div>}

      {!loading && rows.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {isFullQuery && <th className={styles.thDate}>기기</th>}
                <th className={styles.thDate}>날짜</th>
                {visibleCols.runtime && <th className={styles.thCount}>사용시간</th>}
                {visibleCols.distance && <th className={styles.thCount}>주행거리</th>}
                {visibleCols.location && <th className={styles.thCount}>위경도</th>}
                {visibleCols.ulcer && (
                  <th
                    className={styles.thCount}
                    title="횟수를 클릭하면 자세 변경 이벤트별 휠체어 각도(±30초)를 확인할 수 있습니다."
                  >
                    욕창 방지 횟수 (35° 2분 유지)
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.wheelchair_id}-${r.date}`}>
                  {isFullQuery && <td className={styles.tdDate}>{r.device_serial}</td>}
                  <td className={styles.tdDate}>{formatDateStr(r.date)}</td>
                  {visibleCols.runtime && (
                    <td className={styles.tdCount}>{formatRuntime(r.runtime_min)}</td>
                  )}
                  {visibleCols.distance && (
                    <td className={styles.tdCount}>{formatDistance(r.distance_m)}</td>
                  )}
                  {visibleCols.location && (
                    <td className={styles.tdCount}>{formatLocation(r.latitude, r.longitude)}</td>
                  )}
                  {visibleCols.ulcer && (
                    <td className={styles.tdCount}>
                      {r.ulcer_count > 0 ? (
                        <button
                          type="button"
                          className={styles.ulcerLink}
                          onClick={() => setModalRow(r)}
                          title="클릭하면 자세 변경 이벤트별 휠체어 각도(±30초)를 확인할 수 있습니다."
                        >
                          {r.ulcer_count}회
                        </button>
                      ) : (
                        `${r.ulcer_count}회`
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <tbody>
              <tr>
                <td className={styles.emptyCell}>
                  기기를 선택하고 검색하거나, 전체 조회를 눌러주세요.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <PostureEventAnglesModal
        open={modalRow !== null}
        onClose={() => setModalRow(null)}
        wheelchairId={modalRow?.wheelchair_id ?? ''}
        deviceSerial={modalRow?.device_serial ?? ''}
        date={modalRow?.date ? modalRow.date.slice(0, 10) : ''}
        ulcerCount={modalRow?.ulcer_count ?? 0}
      />
    </div>
  );
}
