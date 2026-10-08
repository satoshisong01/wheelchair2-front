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
  operating_min: number | null;
  distance_m: number | null;
  latitude: number | null;
  longitude: number | null;
  ulcer_count: number;
  slope_count: number;
}

// 조회 기간 상한 — 서버(api/admin/wheelchair-daily-history)와 같은 기준(종료일-시작일 일수)
const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

// 필터 가능한 컬럼 키
type ColumnKey = 'runtime' | 'operating' | 'distance' | 'location' | 'ulcer' | 'slope';

const COLUMN_LABELS: Record<ColumnKey, string> = {
  operating: '사용시간',
  runtime: '주행 시간',
  distance: '주행거리',
  location: '위경도',
  ulcer: '욕창 방지 횟수',
  slope: '급경사 경고 횟수',
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

// 📱 Play Store 앱(React Native WebView) 환경 감지 — 이 WebView엔 다운로드 기능이
//   없어, 파일을 base64로 인코딩해 네이티브 앱에 postMessage로 전달해야 저장 가능.
function getReactNativeWebView(): { postMessage: (msg: string) => void } | null {
  const rn = (window as { ReactNativeWebView?: { postMessage: (msg: string) => void } })
    .ReactNativeWebView;
  return rn ?? null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      resolve(result.split(',')[1] ?? ''); // "data:...;base64,XXXX" → "XXXX"
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
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
    operating: true,
    distance: true,
    location: true,
    ulcer: true,
    slope: true,
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
      // 서버가 거부(400)할 기간은 조회 전에 안내 — 빈 표만 보이면 데이터가 없는 것으로 오해함
      if ((Date.parse(toDate) - Date.parse(fromDate)) / DAY_MS > MAX_RANGE_DAYS) {
        alert(`조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다. 기간을 나눠 조회해 주세요.`);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({
          wheelchairId: full ? 'ALL' : selectedId,
          from: fromDate,
          to: toDate,
        });
        const res = await fetch(`/api/admin/wheelchair-daily-history?${params}`);
        if (!res.ok) {
          // 서버가 알려 준 사유(기간 오류·권한 등)를 그대로 안내
          const body = await res.json().catch(() => null);
          alert(body?.message || '기기 사용 내역을 불러오지 못했습니다.');
          setRows([]);
          return;
        }
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

  // 기기 표시명: 시리얼 + 명칭(모델명) — 예: "01222365606 (나래)"
  const modelById = useMemo(
    () =>
      new Map<string, string | undefined>(
        wheelchairs.map((w) => [w.id, w.modelName]),
      ),
    [wheelchairs],
  );
  const getDeviceLabel = useCallback(
    (r: DailyRow) => {
      const name = modelById.get(r.wheelchair_id);
      return name ? `${r.device_serial} (${name})` : r.device_serial;
    },
    [modelById],
  );

  const handleExcelDownload = useCallback(async () => {
    if (rows.length === 0) return;

    // 헤더: 기본 + 활성 컬럼
    const headerBase = isFullQuery ? ['기기', '날짜'] : ['날짜'];
    const headerCols = activeCols.map((c) => COLUMN_LABELS[c]);
    const header = [...headerBase, ...headerCols];

    const body = rows.map((r) => {
      const base = isFullQuery
        ? [getDeviceLabel(r), formatDateStr(r.date)]
        : [formatDateStr(r.date)];
      const cols: string[] = [];
      for (const c of activeCols) {
        if (c === 'runtime') cols.push(formatRuntime(r.runtime_min));
        else if (c === 'operating') cols.push(formatRuntime(r.operating_min));
        else if (c === 'distance') cols.push(formatDistance(r.distance_m));
        else if (c === 'location') cols.push(formatLocation(r.latitude, r.longitude));
        else if (c === 'ulcer') cols.push(`${r.ulcer_count}회`);
        else if (c === 'slope') cols.push(`${r.slope_count}회`);
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
    const safeLabel = deviceLabel.replace(/[/\\?%*:|"<>]/g, '_');
    const filename = `기기사용내역_${safeLabel}_${fromDate}_${toDate}.csv`;

    // 📱 Play Store 앱(WebView) 환경: 네이티브 브릿지로 전달 — 앱이 기기 다운로드
    //    폴더에 저장. 이 경로의 WebView는 Web Share API도 동작하지 않아 바로 처리.
    const rnWebView = getReactNativeWebView();
    if (rnWebView) {
      const base64 = await blobToBase64(blob);
      rnWebView.postMessage(
        JSON.stringify({ type: 'DOWNLOAD_FILE', filename, mimeType: 'text/csv', base64 }),
      );
      return;
    }

    // 📱 안드로이드 PWA(홈화면 설치·standalone) 대응: 이 모드는 주소창·다운로드바가
    //    없어 <a download> + blob URL 클릭이 조용히 무시되는 경우가 있음.
    //    파일 공유(Web Share API)를 지원하면 OS 공유시트로 저장하게 하고,
    //    미지원 환경(대부분 데스크톱)에서는 기존 <a download> 방식으로 폴백.
    const file = new File([blob], filename, { type: 'text/csv' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (err: unknown) {
        // 사용자가 공유시트를 취소한 경우 → 추가 동작 없이 종료
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // 그 외 실패 시 아래 앵커 다운로드로 폴백
      }
    }

    // 📱 iOS Safari 등 대응: DOM에 붙지 않은 <a> 클릭은 일부 모바일 브라우저에서
    //    무시됨 → body에 붙였다가 클릭 후 제거. revokeObjectURL도 클릭 직후 바로
    //    호출하면 비동기 다운로드가 끊길 수 있어 지연 처리.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [rows, isFullQuery, activeCols, fromDate, toDate, selectedId, wheelchairs, getDeviceLabel]);

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
        기기와 기간을 선택하고 조회하면 날짜별 사용시간, 주행거리, 위경도, 욕창 방지 횟수, 급경사 경고 횟수를 확인할 수 있습니다.
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
                {visibleCols.operating && <th className={styles.thCount}>사용시간</th>}
                {visibleCols.runtime && <th className={styles.thCount}>주행 시간</th>}
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
                {visibleCols.slope && (
                  <th
                    className={styles.thCount}
                    title="해당 날짜에 발생한 급경사 경고(SLOPE_WARNING) 알림 횟수입니다."
                  >
                    급경사 경고 횟수
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.wheelchair_id}-${r.date}`}>
                  {isFullQuery && <td className={styles.tdDate}>{getDeviceLabel(r)}</td>}
                  <td className={styles.tdDate}>{formatDateStr(r.date)}</td>
                  {visibleCols.operating && (
                    <td className={styles.tdCount}>{formatRuntime(r.operating_min)}</td>
                  )}
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
                  {visibleCols.slope && (
                    <td className={styles.tdCount}>{r.slope_count}회</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 모바일 카드 뷰 (≤768px에서 테이블은 CSS로 숨겨지고 이 카드가 표시됨) */}
      {!loading && rows.length > 0 && (
        <div className={styles.cardList}>
          {rows.map((r) => (
            <div key={`card-${r.wheelchair_id}-${r.date}`} className={styles.histCard}>
              <div className={styles.histCardHead}>
                {isFullQuery && (
                  <span className={styles.histCardDevice}>{getDeviceLabel(r)}</span>
                )}
                <span className={styles.histCardDate}>{formatDateStr(r.date)}</span>
              </div>
              {visibleCols.operating && (
                <div className={styles.histCardRow}>
                  <span>사용시간</span>
                  <span>{formatRuntime(r.operating_min)}</span>
                </div>
              )}
              {visibleCols.runtime && (
                <div className={styles.histCardRow}>
                  <span>주행 시간</span>
                  <span>{formatRuntime(r.runtime_min)}</span>
                </div>
              )}
              {visibleCols.distance && (
                <div className={styles.histCardRow}>
                  <span>주행거리</span>
                  <span>{formatDistance(r.distance_m)}</span>
                </div>
              )}
              {visibleCols.location && (
                <div className={styles.histCardRow}>
                  <span>위경도</span>
                  <span>{formatLocation(r.latitude, r.longitude)}</span>
                </div>
              )}
              {visibleCols.ulcer && (
                <div className={styles.histCardRow}>
                  <span>욕창 방지 횟수</span>
                  <span>
                    {r.ulcer_count > 0 ? (
                      <button
                        type="button"
                        className={styles.ulcerLink}
                        onClick={() => setModalRow(r)}
                      >
                        {r.ulcer_count}회
                      </button>
                    ) : (
                      `${r.ulcer_count}회`
                    )}
                  </span>
                </div>
              )}
              {visibleCols.slope && (
                <div className={styles.histCardRow}>
                  <span>급경사 경고 횟수</span>
                  <span>{r.slope_count}회</span>
                </div>
              )}
            </div>
          ))}
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

      {/* 모바일 빈 상태 (≤768px) */}
      {!loading && rows.length === 0 && (
        <div className={styles.cardList}>
          <div className={styles.emptyCard}>
            기기를 선택하고 검색하거나, 전체 조회를 눌러주세요.
          </div>
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
