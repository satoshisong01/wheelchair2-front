'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { ko } from 'date-fns/locale/ko';
import { ChevronLeft, Bell, AlertTriangle, Zap, Info, CheckCircle2, Check } from 'lucide-react';
import { useMyWheelchair } from '../../../hooks/useMyWheelchair';

export default function EventsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING'>('ALL');
  const { alarms, setAlarms, loading } = useMyWheelchair();

  // ⭐️ 알람 확인 처리 함수 (개별/전체 공용)
  const handleResolve = async (alarmId?: string | number, all = false) => {
    try {
      const res = await fetch('/api/alarms/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alarmId, all }),
      });

      if (res.ok) {
        setAlarms((prev) =>
          all
            ? prev.map((a) => ({ ...a, is_resolved: true }))
            : prev.map((a) => (a.id === alarmId ? { ...a, is_resolved: true } : a)),
        );
      }
    } catch (error) {
      console.error('알람 처리 실패:', error);
    }
  };

  // ⭐️ [필터 로직] 미확인 알람 중 '긍정 신호'를 제외하고 필터링
  const filteredEvents = useMemo(() => {
    return alarms
      .filter((event) => !event.is_resolved) // 1. 확인된 알림 제외
      .filter((event) => {
        const type = (event.alarmType || event.alarm_type || '').toUpperCase();

        // 💡 [핵심] 성공/완료 신호(SUCCESS, COMPLETE)는 이벤트 목록에서 아예 제외
        const isPositiveSignal = type.includes('COMPLETE') || type.includes('SUCCESS');
        return !isPositiveSignal;
      })
      .filter((event) => {
        // 2. 탭 필터링 (전체/긴급/주의)
        if (filter === 'ALL') return true;
        const type = (event.alarmType || event.alarm_type || '').toUpperCase();
        const level = ['FALL', 'ROLLOVER', 'OBSTACLE', 'CRITICAL'].some((k) => type.includes(k))
          ? 'CRITICAL'
          : 'WARNING';
        return level === filter;
      });
  }, [alarms, filter]);

  const formatTime = (dateInput: any) => {
    if (!dateInput) return '시간정보 없음';
    const dateStr = typeof dateInput === 'string' ? dateInput.replace(' ', 'T') : dateInput;
    return formatInTimeZone(new Date(dateStr), 'Asia/Seoul', 'MM/dd aaa h:mm', { locale: ko });
  };

  const getAlarmMessage = (alarm: any) => {
    if (alarm.message) return alarm.message;
    const type = (alarm.alarmType || alarm.alarm_type || '').toUpperCase();
    const condition = alarm.alarmCondition || alarm.alarm_condition || '';
    switch (type) {
      case 'FALL':
        return '낙상 감지 이벤트 발생';
      case 'ROLLOVER':
        return '휠체어 전복 사고 감지!';
      case 'LOW_VOLTAGE':
        return `배터리 저전압 경고 (${condition})`;
      case 'OBSTACLE':
        return '전방 장애물 감지';
      case 'SLOPE_WARNING':
        return '급경사로 주의 알림';
      case 'POSTURE_ADVICE':
        return '장시간 자세 유지 경고';
      default:
        return condition || type || '알림 발생';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white px-4 py-4 shadow-sm flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 text-gray-600 cursor-pointer active:opacity-50"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold text-gray-800 ml-2">
            이벤트 이력 ({filteredEvents.length})
          </h1>
        </div>

        {filteredEvents.length > 0 && (
          <button
            onClick={() => handleResolve(undefined, true)}
            className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg active:scale-95 cursor-pointer hover:bg-blue-100 transition-colors"
          >
            전체 확인
          </button>
        )}
      </header>

      <div className="px-4 mt-4 mb-2 flex space-x-2">
        <TabButton label="전체" isActive={filter === 'ALL'} onClick={() => setFilter('ALL')} />
        <TabButton
          label="🚨 긴급"
          isActive={filter === 'CRITICAL'}
          onClick={() => setFilter('CRITICAL')}
        />
        <TabButton
          label="⚡ 주의"
          isActive={filter === 'WARNING'}
          onClick={() => setFilter('WARNING')}
        />
      </div>

      <div className="flex-1 px-4 pb-20 overflow-y-auto mt-2">
        {loading && alarms.length === 0 ? (
          <div className="text-center py-10 text-gray-500 text-sm">데이터를 불러오는 중...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <CheckCircle2 className="w-12 h-12 mb-3 opacity-20 text-green-500" />
            <p className="text-sm">확인이 필요한 알림이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map((alarm, index) => {
              const type = (alarm.alarmType || alarm.alarm_type || '').toUpperCase();
              const isCritical = ['FALL', 'ROLLOVER', 'OBSTACLE'].some((k) => type.includes(k));

              return (
                <div
                  key={alarm.id || index}
                  className={`relative p-4 rounded-2xl border bg-white shadow-sm flex items-start space-x-3 border-l-4 ${isCritical ? 'border-l-red-500' : 'border-l-orange-500'}`}
                >
                  <div className={`p-2 rounded-lg ${isCritical ? 'bg-red-50' : 'bg-orange-50'}`}>
                    {isCritical ? (
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    ) : (
                      <Zap className="w-5 h-5 text-orange-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-sm truncate pr-2">{type}</h3>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">
                        {formatTime(alarm.alarmTime || alarm.alarm_time)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1 pr-10">{getAlarmMessage(alarm)}</p>
                  </div>

                  <button
                    onClick={() => handleResolve(alarm.id)}
                    className="absolute bottom-3 right-3 p-1.5 bg-gray-100 rounded-full text-gray-400 cursor-pointer hover:bg-green-100 hover:text-green-600 transition-colors active:scale-90"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ label, isActive, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer 
        ${isActive ? 'bg-gray-800 text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}
    >
      {label}
    </button>
  );
}
