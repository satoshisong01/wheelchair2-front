'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { ko } from 'date-fns/locale/ko';
import { ChevronLeft, Bell, AlertTriangle, Zap, Info, CheckCircle2 } from 'lucide-react';

// ⭐️ [기존 로직] 유연한 알람 인터페이스 정의
interface AlarmItem {
  id?: string | number;
  wheelchairId?: string | number;
  wheelchair_id?: string | number;
  alarmType?: string;
  message?: string;
  alarmCondition?: string;
  alarmTime?: string | Date;
  alarm_time?: string | Date;
  isResolved?: boolean; // 모바일용 추가 필드 (해결 여부)
  wheelchair?: {
    deviceSerial?: string;
    device_serial?: string;
  };
  [key: string]: any;
}

// 🧪 [테스트 데이터] AlarmItem 구조에 맞춤
const MOCK_EVENTS: AlarmItem[] = [
  {
    id: 1,
    alarmType: 'FALL',
    message: '낙상 감지 이벤트 발생',
    alarmCondition: '45도 기울기',
    alarmTime: new Date().toISOString(), // 방금
    isResolved: false,
  },
  {
    id: 2,
    alarmType: 'LOW_VOLTAGE',
    alarmCondition: '15%',
    alarmTime: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30분 전
    isResolved: false,
  },
  {
    id: 3,
    alarmType: 'OBSTACLE',
    message: '전방 장애물 감지',
    alarmTime: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2시간 전
    isResolved: true,
  },
  {
    id: 4,
    alarmType: 'SLOPE_WARNING',
    alarmCondition: '급경사',
    alarmTime: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 어제
    isResolved: true,
  },
];

export default function EventsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING'>('ALL');

  // ⭐️ [기존 로직] 시간 포맷팅 함수
  const formatTime = (dateInput: Date | string | undefined) => {
    if (!dateInput) return '시간정보 없음';
    try {
      const dateStr = typeof dateInput === 'string' ? dateInput.replace(' ', 'T') : dateInput;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '시간정보 없음';

      // 모바일이라 'aaa h:mm' 형태로 조금 짧게 변경 (예: 오후 2:30)
      return formatInTimeZone(date, 'Asia/Seoul', 'MM/dd aaa h:mm', { locale: ko });
    } catch {
      return '시간 오류';
    }
  };

  // ⭐️ [기존 로직] 알람 메시지 생성 함수
  const getAlarmMessage = (alarm: AlarmItem) => {
    if (alarm.message) return alarm.message;
    switch (alarm.alarmType) {
      case 'FALL':
        return '낙상 감지 이벤트 발생';
      case 'LOW_VOLTAGE':
        return `배터리 저전압 경고 (${alarm.alarmCondition || ''})`;
      case 'OBSTACLE':
        return '장애물 감지';
      case 'SLOPE_WARNING':
        return '급경사로 경고';
      default:
        return alarm.alarmCondition || alarm.alarmType || '알 수 없는 알람';
    }
  };

  // ⭐️ [기존 로직 + Tailwind] 위험도별 스타일 매핑
  const getSeverityStyle = (alarmType: string = '') => {
    switch (alarmType) {
      case 'FALL':
      case 'OBSTACLE':
        return {
          level: 'CRITICAL',
          icon: <AlertTriangle className="w-5 h-5 text-red-600" />,
          bg: 'bg-red-50',
          border: 'border-red-100',
          text: 'text-red-700',
        };
      case 'LOW_VOLTAGE':
      case 'SLOPE_WARNING':
        return {
          level: 'WARNING',
          icon: <Zap className="w-5 h-5 text-orange-600" />,
          bg: 'bg-orange-50',
          border: 'border-orange-100',
          text: 'text-orange-700',
        };
      default:
        return {
          level: 'INFO',
          icon: <Info className="w-5 h-5 text-blue-600" />,
          bg: 'bg-blue-50',
          border: 'border-blue-100',
          text: 'text-blue-700',
        };
    }
  };

  // 필터링 로직
  const filteredEvents = MOCK_EVENTS.filter((event) => {
    if (filter === 'ALL') return true;
    const style = getSeverityStyle(event.alarmType);
    return style.level === filter;
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white px-4 py-4 shadow-sm flex items-center sticky top-0 z-10">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-600">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 ml-2">이벤트 이력</h1>
      </header>

      {/* 탭 필터 */}
      <div className="px-4 mt-4 mb-2">
        <div className="flex space-x-2">
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
      </div>

      {/* 리스트 영역 */}
      <div className="flex-1 px-4 pb-20 overflow-y-auto mt-2">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Bell className="w-12 h-12 mb-3 opacity-20" />
            <p>해당하는 알림이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map((alarm, index) => {
              const style = getSeverityStyle(alarm.alarmType);
              const uniqueKey = alarm.id ? `${alarm.id}-${index}` : `alarm-${index}`;

              return (
                <div
                  key={uniqueKey}
                  className={`relative p-4 rounded-2xl border bg-white shadow-sm active:scale-[0.99] transition-transform mt-2
                    ${alarm.isResolved ? 'opacity-60 bg-gray-50' : `ring-1 ring-offset-1 ${style.border}`}
                  `}
                >
                  <div className="flex items-start space-x-3">
                    {/* 아이콘 박스 */}
                    <div className={`p-3 rounded-xl flex-shrink-0 ${style.bg}`}>{style.icon}</div>

                    {/* 내용 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className={`font-bold truncate pr-2 ${style.text}`}>
                          {alarm.alarmType || '알림'}
                        </h3>
                        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                          {formatTime(alarm.alarmTime || alarm.alarm_time)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 leading-snug break-keep">
                        {getAlarmMessage(alarm)}
                      </p>
                    </div>
                  </div>

                  {/* 해결됨 배지 */}
                  {alarm.isResolved && (
                    <div className="absolute bottom-3 right-3 flex items-center text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      해결됨
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// 📦 탭 버튼 컴포넌트
function TabButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-bold transition-colors whitespace-nowrap
        ${
          isActive
            ? 'bg-gray-800 text-white shadow-md'
            : 'bg-white text-gray-500 border border-gray-200'
        }`}
    >
      {label}
    </button>
  );
}
