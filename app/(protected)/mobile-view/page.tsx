// 경로: app/(protected)/mobile-view/page.tsx
// 📝 설명: 확인되지 않은 부정 알람만 카운트 + 카드 버튼 커서 스타일 적용

'use client';

import React, { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useMyWheelchair } from '../../hooks/useMyWheelchair';
import {
  Battery,
  MapPin,
  Accessibility,
  CloudSun,
  Bell,
  BrainCircuit,
  AlertTriangle,
} from 'lucide-react';

export default function MobileViewPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const { data: wheelchairData, loading, latestAlarm, alarms } = useMyWheelchair();

  const status = (wheelchairData?.status || {}) as any;

  // ⭐️ [핵심 수정] 미확인 알람 중 '긍정 신호(성공/완료)'를 제외하고 실제 경고 갯수만 계산
  const unresolveWarningAlarms = alarms.filter((a) => {
    const type = (a.alarmType || a.alarm_type || '').toUpperCase();
    const isPositive = type.includes('COMPLETE') || type.includes('SUCCESS');
    return !a.is_resolved && !isPositive; // 확인 안 됨 AND 긍정 신호 아님
  });

  const hasAlarms = unresolveWarningAlarms.length > 0;
  const alarmCount = unresolveWarningAlarms.length;

  // 진동 효과 (RN 앱 환경일 경우)
  useEffect(() => {
    if (latestAlarm && (window as any).ReactNativeWebView) {
      (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'VIBRATE' }));
    }
  }, [latestAlarm]);

  // --- 데이터 가공 ---
  const batteryLevel = status.current_battery ?? 0;
  const isLowBattery = batteryLevel < 20;
  const distanceKm = status.distance ? Number(status.distance).toFixed(1) : '0.0';
  const rawSeatAngle = status.angle_seat ?? status.angleSeat ?? 0;
  const seatAngle = Number(rawSeatAngle) || 0;
  const sensorTemp = status.temperature ? Number(status.temperature).toFixed(1) : '24.0';
  const outdoorTemp =
    status.outdoor_temp !== undefined ? Number(status.outdoor_temp).toFixed(1) : sensorTemp;
  const weatherDesc = status.weather_desc ?? '맑음';

  // 욕창 예방 횟수는 긍정 신호를 포함한 전체 성공 횟수를 표시
  const ulcerPreventionCount = status.ulcer_count ?? status.ulcerCount ?? 0;

  const menuItems = [
    {
      id: 'battery',
      title: '배터리 정보',
      value: `${batteryLevel}%`,
      sub: isLowBattery ? '충전 필요!' : '주행 가능',
      icon: (
        <Battery
          className={`w-6 h-6 ${batteryLevel === 0 ? 'text-gray-400' : isLowBattery ? 'text-red-600' : 'text-blue-600'}`}
        />
      ),
      bgColor: batteryLevel === 0 ? 'bg-gray-50' : isLowBattery ? 'bg-red-50' : 'bg-blue-50',
      borderColor: isLowBattery ? 'border-red-200' : 'border-blue-100',
      textColor: isLowBattery ? 'text-red-900' : 'text-blue-900',
      onClick: () => router.push('/mobile-view/battery'),
    },
    {
      id: 'location',
      title: '위치 및 거리',
      value: `${distanceKm} km`,
      sub: '오늘 이동 거리',
      icon: <MapPin className="w-6 h-6 text-green-600" />,
      bgColor: 'bg-green-50',
      borderColor: 'border-green-100',
      textColor: 'text-green-900',
      onClick: () => router.push('/mobile-view/location'),
    },
    {
      id: 'posture',
      title: '자세 및 욕창 예방',
      value: `예방 ${ulcerPreventionCount}회`,
      sub: `현재 시트 각도 ${seatAngle.toFixed(0)}°`,
      icon: <Accessibility className="w-6 h-6 text-indigo-600" />,
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      textColor: 'text-indigo-900',
      highlight: true,
      onClick: () => router.push('/mobile-view/posture'),
    },
    {
      id: 'weather',
      title: '외부 날씨 정보',
      value: `${outdoorTemp}°C`,
      sub: `현재 상태: ${weatherDesc}`,
      icon: <CloudSun className="w-6 h-6 text-orange-600" />,
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-100',
      textColor: 'text-orange-900',
      onClick: () => router.push('/mobile-view/weather'),
    },
    {
      id: 'event',
      title: '이벤트 이력',
      // ⭐️ [수정] 확인되지 않은 경고 알람 갯수만 표시
      value: hasAlarms ? `${alarmCount}건 감지` : '안전',
      sub: hasAlarms ? '확인 필요' : '최근 경고 없음',
      icon: (
        <Bell
          className={`w-6 h-6 ${hasAlarms ? 'text-red-600 animate-bounce' : 'text-gray-600'}`}
        />
      ),
      bgColor: hasAlarms ? 'bg-red-100' : 'bg-gray-50',
      borderColor: hasAlarms ? 'border-red-300' : 'border-gray-100',
      textColor: hasAlarms ? 'text-red-900' : 'text-gray-900',
      onClick: () => router.push('/mobile-view/events'),
    },
    {
      id: 'ai',
      title: '패턴 인식',
      value: '분석중',
      sub: '주행 습관 분석',
      icon: <BrainCircuit className="w-6 h-6 text-purple-600" />,
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-100',
      textColor: 'text-purple-900',
      onClick: () => router.push('/mobile-view/ai'),
    },
  ];

  return (
    <div
      className={`min-h-screen flex flex-col pb-6 transition-colors duration-500 ${hasAlarms ? 'bg-red-50' : 'bg-gray-50'}`}
    >
      {/* 상단 헤더 */}
      <header
        className={`px-6 py-8 shadow-sm rounded-b-3xl mb-4 z-10 transition-colors duration-500 ${hasAlarms ? 'bg-red-500' : 'bg-white'}`}
      >
        <div className="flex justify-between items-center">
          <div>
            <h1 className={`text-2xl font-bold ${hasAlarms ? 'text-white' : 'text-gray-800'}`}>
              {hasAlarms
                ? '🚨 경고 발생!'
                : `${wheelchairData?.nickname || session?.user?.name || '사용자'}님 👋`}
            </h1>
            <p className={`text-base mt-1 ${hasAlarms ? 'text-red-100' : 'text-gray-500'}`}>
              {hasAlarms
                ? '휠체어 상태를 확인하세요'
                : loading
                  ? '데이터 로딩 중...'
                  : '오늘도 안전한 주행 되세요!'}
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 px-4 overflow-y-auto">
        {/* 미확인 경고 알람이 있을 때만 띠지 노출 */}
        {hasAlarms && (
          <div className="mb-4 bg-white border-l-4 border-red-500 rounded-r-xl p-4 shadow-md flex items-start animate-pulse">
            <AlertTriangle className="w-6 h-6 text-red-500 mr-3 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-red-600 text-lg">위험 신호 감지</h3>
              <p className="text-sm text-gray-600 mt-0.5">
                {unresolveWarningAlarms[0]?.message ||
                  unresolveWarningAlarms[0]?.alarmType ||
                  unresolveWarningAlarms[0]?.alarm_type ||
                  '확인이 필요한 이벤트가 있습니다.'}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`
                relative px-5 py-4 rounded-2xl border text-left transition-all active:scale-95 shadow-sm flex items-center w-full h-auto 
                cursor-pointer 
                ${item.bgColor} ${item.borderColor} 
                ${item.highlight ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}
              `}
            >
              <div className="mr-4 flex-shrink-0">{item.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                  <span className={`font-bold text-base ${item.textColor} truncate mr-2`}>
                    {item.title}
                  </span>
                  <span className={`text-2xl font-bold ${item.textColor} whitespace-nowrap`}>
                    {item.value}
                  </span>
                </div>
                <div className={`text-xs opacity-80 ${item.textColor} truncate`}>{item.sub}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="h-6"></div>
      </div>
    </div>
  );
}
