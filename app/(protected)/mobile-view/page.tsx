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

  const { data: wheelchairData, loading } = useMyWheelchair();
  const status = (wheelchairData?.status || {}) as any;
  const alarms = (wheelchairData as any)?.alarms || [];
  const hasAlarms = alarms.length > 0;

  // 진동 효과
  useEffect(() => {
    if (hasAlarms && (window as any).ReactNativeWebView) {
      (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'VIBRATE' }));
    }
  }, [hasAlarms]);

  // --- 데이터 가공 ---
  const batteryLevel = status.current_battery ?? 0;
  const isLowBattery = batteryLevel < 20;
  const distanceKm = status.distance ? Number(status.distance).toFixed(1) : '0.0';
  const seatAngle = status.angleSeat ? Number(status.angleSeat).toFixed(0) : '0';
  const sensorTemp = status.temperature ? Number(status.temperature).toFixed(1) : '24.0';
  const outdoorTemp =
    status.outdoor_temp !== undefined ? Number(status.outdoor_temp).toFixed(1) : sensorTemp;
  const weatherDesc = status.weather_desc ?? '맑음';
  const postureMaintainTime = status.postureTime ?? '0시간 45분';
  const ulcerPreventionCount = status.ulcerCount ?? 5;

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
      value: postureMaintainTime,
      sub: `현재 ${seatAngle}° | 오늘 예방 ${ulcerPreventionCount}회`,
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
      value: hasAlarms ? `${alarms.length}건 감지` : '안전',
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
      title: 'AI 패턴 인식',
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

      {/* 메인 컨텐츠 */}
      <div className="flex-1 px-4 overflow-y-auto">
        {hasAlarms && (
          <div className="mb-4 bg-white border-l-4 border-red-500 rounded-r-xl p-4 shadow-md flex items-start animate-pulse">
            <AlertTriangle className="w-6 h-6 text-red-500 mr-3 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-red-600 text-lg">위험 신호 감지</h3>
              <p className="text-sm text-gray-600 mt-0.5">
                {alarms[0]?.message || '센서 이상이 발견되었습니다.'}
              </p>
            </div>
          </div>
        )}

        {/* 🟢 반응형 그리드 적용 */}
        {/* 모바일: grid-cols-1 (1줄) / PC(md 이상): md:grid-cols-2 (2줄) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`
                relative p-5 rounded-2xl border text-left transition-all active:scale-95 shadow-sm
                flex flex-col justify-between 
                h-32 md:h-40  /* 🟢 모바일: h-32 (작게), PC: h-40 (크게) 자동 조절 */
                ${item.bgColor} ${item.borderColor}
                ${item.highlight ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}
              `}
            >
              <div className="flex justify-between items-start">
                <span className={`font-semibold text-base ${item.textColor}`}>{item.title}</span>
                {item.icon}
              </div>
              <div className="mt-2">
                <div className={`text-3xl font-bold ${item.textColor}`}>{item.value}</div>
                <div className={`text-sm mt-1 opacity-80 ${item.textColor}`}>{item.sub}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="h-6"></div>
      </div>
    </div>
  );
}
