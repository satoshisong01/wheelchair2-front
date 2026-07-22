'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { ko } from 'date-fns/locale/ko';
import { getAlarmTypeLabel } from '@/lib/alarmLabels';

interface PostureEventAnglesModalProps {
  open: boolean;
  onClose: () => void;
  wheelchairId: string;
  deviceSerial: string;
  date: string; // YYYY-MM-DD (KST)
  ulcerCount: number; // for header context
}

interface PostureEvent {
  id: string;
  alarmType: string;
  epochMs: number;
}

interface AngleSample {
  time: string;
  angleBack: number | null;
  angleSeat: number | null;
  slopeSide: number | null;
  slopeFr: number | null;
  footAngle: number | null;
}

interface AnglesResponse {
  eventMs: number;
  deviceSerial: string;
  alarmType: string;
  window: number;
  samples: AngleSample[];
}

const ANGLE_WINDOW = 30;

function formatKstTime(epochMs: number): string {
  return formatInTimeZone(new Date(epochMs), 'Asia/Seoul', 'aaa h:mm:ss', { locale: ko });
}

/** Timestream 의 UTC time 문자열("2026-07-13 05:30:12.123000000")을 epoch ms 로 변환 */
function tsTimeToMs(timeStr: string): number {
  let s = timeStr.trim().replace(' ', 'T');
  // 소수점 이하는 밀리초(3자리)까지만 사용
  s = s.replace(/(\.\d{3})\d*/, '$1');
  if (!s.endsWith('Z')) s += 'Z';
  return new Date(s).getTime();
}

function formatSampleTime(timeStr: string): string {
  const ms = tsTimeToMs(timeStr);
  if (Number.isNaN(ms)) return '-';
  return formatInTimeZone(new Date(ms), 'Asia/Seoul', 'h:mm:ss', { locale: ko });
}

function formatDateStr(d: string): string {
  if (!d) return '-';
  const [y, m, day] = d.split('-');
  const month = Number(m);
  const dayNum = Number(day);
  if (Number.isNaN(month) || Number.isNaN(dayNum)) return d;
  return `${y}. ${month}. ${dayNum}`;
}

function formatAngle(v: number | null): string {
  if (v === null || v === undefined) return '-';
  return v.toFixed(1);
}

export default function PostureEventAnglesModal({
  open,
  onClose,
  wheelchairId,
  deviceSerial,
  date,
  ulcerCount,
}: PostureEventAnglesModalProps) {
  const [events, setEvents] = useState<PostureEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'complete' | 'all'>('complete');

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [angles, setAngles] = useState<AnglesResponse | null>(null);
  const [anglesLoading, setAnglesLoading] = useState(false);
  const [anglesError, setAnglesError] = useState<string | null>(null);

  // Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // 열릴 때 이벤트 목록 조회 + 상태 초기화
  useEffect(() => {
    if (!open || !wheelchairId || !date) return;

    let cancelled = false;
    setSelectedEventId(null);
    setTypeFilter('complete');
    setAngles(null);
    setAnglesError(null);
    setEventsError(null);
    setEventsLoading(true);

    const params = new URLSearchParams({ wheelchairId, date });
    fetch(`/api/admin/posture-events?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('이벤트 조회 실패');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setEvents(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setEvents([]);
        setEventsError('이벤트를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, wheelchairId, date]);

  const handleEventClick = useCallback((event: PostureEvent) => {
    setSelectedEventId(event.id);
    setAngles(null);
    setAnglesError(null);
    setAnglesLoading(true);

    const params = new URLSearchParams({ alarmId: event.id, window: String(ANGLE_WINDOW) });
    fetch(`/api/admin/posture-events/angles?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('각도 조회 실패');
        return res.json();
      })
      .then((data: AnglesResponse) => {
        setAngles(data);
      })
      .catch((e) => {
        console.error(e);
        setAngles(null);
        setAnglesError('각도 데이터를 불러오지 못했습니다.');
      })
      .finally(() => {
        setAnglesLoading(false);
      });
  }, []);

  if (!open) return null;

  // 좌측 목록: 타입별 카운트 + 필터 적용
  const completeCount = events.filter((e) => e.alarmType === 'POSTURE_COMPLETE').length;
  const adviceCount = events.length - completeCount;
  const shownEvents =
    typeFilter === 'complete'
      ? events.filter((e) => e.alarmType === 'POSTURE_COMPLETE')
      : events;

  // 이벤트 시각에 가장 가까운 샘플 인덱스 (하이라이트용)
  let nearestIdx = -1;
  if (angles && angles.samples.length > 0) {
    let best = Infinity;
    angles.samples.forEach((s, i) => {
      const diff = Math.abs(tsTimeToMs(s.time) - angles.eventMs);
      if (diff < best) {
        best = diff;
        nearestIdx = i;
      }
    });
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
          width: '100%',
          maxWidth: 860,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #eee',
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 700, color: '#111', fontSize: 15 }}>
            {deviceSerial} · {formatDateStr(date)} · 욕창 방지 {ulcerCount}회
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              color: '#6b7280',
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* 본문 */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* 이벤트 목록 (좌측) */}
          <div
            style={{
              width: 240,
              flexShrink: 0,
              borderRight: '1px solid #eee',
              overflowY: 'auto',
              background: '#f9fafb',
            }}
          >
            <div
              style={{
                padding: '10px 16px',
                borderBottom: '1px solid #eee',
                position: 'sticky',
                top: 0,
                background: '#f9fafb',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: '#374151' }}>자세 변경 이벤트</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                완료 {completeCount}회 · 권고 {adviceCount}회
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setTypeFilter('complete')}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: typeFilter === 'complete' ? '1px solid #0f2a4a' : '1px solid #d1d5db',
                    background: typeFilter === 'complete' ? '#0f2a4a' : '#fff',
                    color: typeFilter === 'complete' ? '#fff' : '#6b7280',
                  }}
                >
                  완료 {completeCount}
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('all')}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: typeFilter === 'all' ? '1px solid #0f2a4a' : '1px solid #d1d5db',
                    background: typeFilter === 'all' ? '#0f2a4a' : '#fff',
                    color: typeFilter === 'all' ? '#fff' : '#6b7280',
                  }}
                >
                  전체 {events.length}
                </button>
              </div>
            </div>

            {eventsLoading && (
              <div style={{ padding: 16, color: '#6b7280', fontSize: 13 }}>불러오는 중...</div>
            )}
            {!eventsLoading && eventsError && (
              <div style={{ padding: 16, color: '#dc2626', fontSize: 13 }}>{eventsError}</div>
            )}
            {!eventsLoading && !eventsError && events.length === 0 && (
              <div style={{ padding: 16, color: '#6b7280', fontSize: 13 }}>
                해당 날짜에 자세 변경 이벤트가 없습니다.
              </div>
            )}
            {!eventsLoading && !eventsError && events.length > 0 && shownEvents.length === 0 && (
              <div style={{ padding: 16, color: '#6b7280', fontSize: 13 }}>
                완료 이벤트가 없습니다. &apos;전체&apos;를 눌러 권고를 확인하세요.
              </div>
            )}
            {!eventsLoading &&
              !eventsError &&
              shownEvents.map((ev) => {
                const active = ev.id === selectedEventId;
                const isComplete = ev.alarmType === 'POSTURE_COMPLETE';
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => handleEventClick(ev)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 3,
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 16px',
                      border: 'none',
                      borderBottom: '1px solid #eee',
                      borderLeft: active ? '3px solid #0d6efd' : '3px solid transparent',
                      background: active ? '#eef4ff' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        width: '100%',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: isComplete ? 700 : 500,
                          color: isComplete ? '#111' : '#6b7280',
                          fontSize: 13,
                        }}
                      >
                        {formatKstTime(ev.epochMs)}
                      </span>
                      {isComplete ? (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#fff',
                            background: '#047857',
                            borderRadius: 4,
                            padding: '1px 6px',
                          }}
                        >
                          완료
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: '#9ca3af',
                            border: '1px solid #d1d5db',
                            borderRadius: 4,
                            padding: '1px 6px',
                          }}
                        >
                          권고
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: isComplete ? 600 : 400,
                        color: isComplete ? '#047857' : '#9ca3af',
                      }}
                    >
                      {getAlarmTypeLabel(ev.alarmType)}
                    </span>
                  </button>
                );
              })}
          </div>

          {/* 각도 상세 (우측) */}
          <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 16 }}>
            {!selectedEventId && (
              <div style={{ color: '#6b7280', fontSize: 14, padding: 8 }}>
                왼쪽에서 이벤트를 선택하면 해당 시각(±{ANGLE_WINDOW}초)의 휠체어 각도를 확인할 수 있습니다.
              </div>
            )}

            {selectedEventId && anglesLoading && (
              <div style={{ color: '#6b7280', fontSize: 14, padding: 8 }}>각도 데이터를 불러오는 중...</div>
            )}

            {selectedEventId && !anglesLoading && anglesError && (
              <div style={{ color: '#dc2626', fontSize: 14, padding: 8 }}>{anglesError}</div>
            )}

            {selectedEventId && !anglesLoading && !anglesError && angles && (
              <>
                <div style={{ fontSize: 13, color: '#374151', marginBottom: 10, fontWeight: 600 }}>
                  이벤트 시각: {formatKstTime(angles.eventMs)} · {getAlarmTypeLabel(angles.alarmType)}
                </div>

                {angles.samples.length === 0 ? (
                  <div style={{ color: '#6b7280', fontSize: 14, padding: 8 }}>
                    해당 구간(±{ANGLE_WINDOW}초) 각도 데이터가 없습니다.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table
                      style={{
                        width: '100%',
                        minWidth: 520,
                        borderCollapse: 'collapse',
                        fontSize: 13,
                      }}
                    >
                      <thead>
                        <tr>
                          {['시각(KST)', '등받이(°)', '좌석(°)', '좌우기울기(°)', '전후기울기(°)', '발판(°)'].map(
                            (h) => (
                              <th
                                key={h}
                                style={{
                                  border: '1px solid #eee',
                                  padding: '8px 10px',
                                  background: '#f8f9fa',
                                  fontWeight: 600,
                                  color: '#111',
                                  whiteSpace: 'nowrap',
                                  textAlign: h.startsWith('시각') ? 'left' : 'right',
                                }}
                              >
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {angles.samples.map((s, i) => {
                          const highlight = i === nearestIdx;
                          return (
                            <tr key={`${s.time}-${i}`} style={{ background: highlight ? '#fff7e6' : '#fff' }}>
                              <td
                                style={{
                                  border: '1px solid #eee',
                                  padding: '7px 10px',
                                  whiteSpace: 'nowrap',
                                  fontWeight: highlight ? 700 : 400,
                                  color: '#111',
                                }}
                              >
                                {formatSampleTime(s.time)}
                                {highlight ? ' ◀' : ''}
                              </td>
                              <td style={cellStyle}>{formatAngle(s.angleBack)}</td>
                              <td style={cellStyle}>{formatAngle(s.angleSeat)}</td>
                              <td style={cellStyle}>{formatAngle(s.slopeSide)}</td>
                              <td style={cellStyle}>{formatAngle(s.slopeFr)}</td>
                              <td style={cellStyle}>{formatAngle(s.footAngle)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  border: '1px solid #eee',
  padding: '7px 10px',
  textAlign: 'right',
  color: '#111',
  whiteSpace: 'nowrap',
};
