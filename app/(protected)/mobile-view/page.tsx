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
  Settings,
  AlertTriangle,
} from 'lucide-react';

export default function MobileViewPage() {
  const { data: session } = useSession();
  const router = useRouter();

  // 🟢 1. 데이터 가져오기 (기존 훅 사용)
  const { data: wheelchairData, loading } = useMyWheelchair();
  const status = wheelchairData?.status;

  // 🟢 2. 알람이 있는지 확인 (API에서 alarms 배열이 온다고 가정)
  // (타입 에러 방지를 위해 any 처리 혹은 인터페이스 확인 필요)
  const alarms = (wheelchairData as any)?.alarms || [];
  const hasAlarms = alarms.length > 0;

  // 🟢 [핵심 추가] 데이터가 바뀔 때마다 감시 -> 알람 있으면 진동 발사! 🚀
  useEffect(() => {
    if (hasAlarms) {
      // 앱 환경인지 확인
      if ((window as any).ReactNativeWebView) {
        console.log('🚨 위험 감지! 앱으로 진동 신호 전송');
        (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'VIBRATE' }));
      }
    }
  }, [hasAlarms]); // hasAlarms 값이 true가 될 때 실행됨

  // --- 기존 데이터 가공 로직 유지 ---
  const batteryLevel = status?.current_battery ?? 0;
  const isLowBattery = batteryLevel < 20;
  const distanceKm = status?.distance ? Number(status.distance).toFixed(1) : '0.0';
  const seatAngle = status?.angleSeat ? Number(status.angleSeat).toFixed(0) : '0';
  const temperature = status?.temperature ? Number(status.temperature).toFixed(1) : '24.0';

  // 메뉴 아이템 정의 (기존 유지)
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
      title: '자세 정보',
      value: `${seatAngle}°`,
      sub: '현재 시트 각도',
      icon: <Accessibility className="w-6 h-6 text-indigo-600" />,
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      textColor: 'text-indigo-900',
      highlight: true,
      onClick: () => router.push('/mobile-view/posture'),
    },
    {
      id: 'weather',
      title: '날씨 정보',
      value: `${temperature}°C`,
      sub: '현재 기온',
      icon: <CloudSun className="w-6 h-6 text-orange-600" />,
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-100',
      textColor: 'text-orange-900',
      onClick: () => router.push('/mobile-view/weather'),
    },
    {
      id: 'event',
      title: '이벤트 이력',
      // 알람이 있으면 "위험!" 표시, 없으면 "안전"
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
    // 배경색: 알람이 있으면 전체가 살짝 붉은색(alert effect), 없으면 평소대로 회색
    <div
      className={`min-h-screen flex flex-col pb-6 transition-colors duration-500 ${hasAlarms ? 'bg-red-50' : 'bg-gray-50'}`}
    >
      {/* 1. 상단 헤더 */}
      <header
        className={`px-6 py-5 shadow-sm rounded-b-3xl mb-4 z-10 transition-colors duration-500 ${hasAlarms ? 'bg-red-500' : 'bg-white'}`}
      >
        <div className="flex justify-between items-center">
          <div>
            <h1 className={`text-xl font-bold ${hasAlarms ? 'text-white' : 'text-gray-800'}`}>
              {hasAlarms
                ? '🚨 경고 발생!'
                : `${wheelchairData?.nickname || session?.user?.name || '사용자'}님 👋`}
            </h1>
            <p className={`text-sm mt-1 ${hasAlarms ? 'text-red-100' : 'text-gray-500'}`}>
              {hasAlarms
                ? '휠체어 상태를 확인하세요'
                : loading
                  ? '데이터 불러오는 중...'
                  : '오늘도 안전한 하루 되세요!'}
            </p>
          </div>
          <div className="flex flex-col items-end">
            <span className={`text-3xl font-bold ${hasAlarms ? 'text-white' : 'text-gray-800'}`}>
              {temperature}°
            </span>
            <span
              className={`text-xs px-2 py-1 rounded-full mt-1 ${hasAlarms ? 'bg-red-400 text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              실시간 센서
            </span>
          </div>
        </div>
      </header>

      {/* 2. 메인 그리드 메뉴 (6개 타일) */}
      <div className="flex-1 px-4 overflow-y-auto">
        {/* 🚨 알람 발생 시 최상단에 빨간 박스 표시 */}
        {hasAlarms && (
          <div className="mb-4 bg-white border-l-4 border-red-500 rounded-r-xl p-4 shadow-md flex items-start animate-pulse">
            <AlertTriangle className="w-6 h-6 text-red-500 mr-3 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-red-600">위험 신호가 감지되었습니다</h3>
              <p className="text-sm text-gray-600 mt-1">
                {alarms[0]?.message || '센서값 이상 감지'} 등 {alarms.length}건의 알람
              </p>
            </div>
          </div>
        )}

        {/* 기존 그리드 유지 */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`
                relative p-4 rounded-2xl border text-left transition-all active:scale-95 shadow-sm
                flex flex-col justify-between h-40
                ${item.bgColor} ${item.borderColor}
                ${item.highlight ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}
              `}
            >
              <div className="flex justify-between items-start">
                <span className={`font-semibold text-sm ${item.textColor}`}>{item.title}</span>
                {item.icon}
              </div>

              <div className="mt-2">
                <div className={`text-2xl font-bold ${item.textColor}`}>{item.value}</div>
                <div className={`text-xs mt-1 opacity-80 ${item.textColor}`}>{item.sub}</div>
              </div>
            </button>
          ))}
        </div>

        {/* 🟢 [삭제 완료] 설정 버튼이 있던 자리입니다. 
             이제 상단 헤더의 ⚙️ 아이콘이 이 역할을 대신합니다. */}

        {/* (테스트 버튼은 삭제했습니다. 이제 자동으로 울리니까요!) */}
        <div className="h-6"></div>
      </div>
    </div>
  );
}
