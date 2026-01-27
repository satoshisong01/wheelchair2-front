// app/(protected)/mobile-view/page.tsx
'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useMyWheelchair } from '../../hooks/useMyWheelchair'; // 🟢 훅 연결
import {
  Battery,
  MapPin,
  Accessibility,
  CloudSun,
  Bell,
  BrainCircuit,
  Settings,
} from 'lucide-react';

export default function MobileViewPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const sendVibrationSignal = () => {
    // 앱(WebView) 안에서 실행 중인지 확인
    if ((window as any).ReactNativeWebView) {
      // 앱한테 "야, 진동 울려!" 라고 메시지 전송
      (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'VIBRATE' }));
    } else {
      alert('여기는 PC 브라우저라 진동이 안 울려요. 앱에서 눌러주세요!');
    }
  };

  // 🟢 1. 실시간 데이터 가져오기
  const { data: wheelchairData, loading } = useMyWheelchair();
  const status = wheelchairData?.status;

  // 🟢 2. 데이터 가공 (없으면 기본값 0)
  // 배터리
  const batteryLevel = status?.current_battery ?? 0;
  const isLowBattery = batteryLevel < 20;

  // 주행 거리 (소수점 1자리)
  const distanceKm = status?.distance ? Number(status.distance).toFixed(1) : '0.0';

  // 자세 (시트 각도)
  const seatAngle = status?.angleSeat ? Number(status.angleSeat).toFixed(0) : '0';

  // 온도
  const temperature = status?.temperature ? Number(status.temperature).toFixed(1) : '24.0';

  // 메뉴 아이템 정의
  const menuItems = [
    {
      id: 'battery',
      title: '배터리 정보',
      value: `${batteryLevel}%`,
      sub: isLowBattery ? '충전 필요!' : '주행 가능',
      // 배터리가 없으면(0) 회색, 낮으면 빨강, 정상이면 파랑
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
      value: `${seatAngle}°`, // 현재 각도 표시
      sub: '현재 시트 각도',
      icon: <Accessibility className="w-6 h-6 text-indigo-600" />,
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      textColor: 'text-indigo-900',
      highlight: true, // 강조 효과
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
      onClick: () => router.push('/mobile-view/weather'), // 🟢 여기로 이동하게 수정!
    },
    {
      id: 'event',
      title: '이벤트 이력',
      value: '안전', // 추후 알림 개수 연동
      sub: '최근 경고 없음',
      icon: <Bell className="w-6 h-6 text-red-600" />,
      bgColor: 'bg-red-50',
      borderColor: 'border-red-100',
      textColor: 'text-red-900',
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
    <div className="min-h-screen bg-gray-50 flex flex-col pb-6">
      {/* 1. 상단 헤더 */}
      <header className="bg-white px-6 py-5 shadow-sm rounded-b-3xl mb-4 z-10">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {wheelchairData?.nickname || session?.user?.name || '사용자'}님 👋
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {loading ? '데이터 불러오는 중...' : '오늘도 안전한 하루 되세요!'}
            </p>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-3xl font-bold text-gray-800">{temperature}°</span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full mt-1">
              실시간 센서
            </span>
          </div>
        </div>
      </header>

      {/* 2. 메인 그리드 메뉴 (6개 타일) */}
      <div className="flex-1 px-4 overflow-y-auto">
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

        {/* 3. 하단 설정 버튼 */}
        <button
          onClick={() => alert('설정 기능 준비중입니다.')}
          className="w-full bg-white border border-gray-200 p-4 rounded-2xl shadow-sm flex items-center justify-center space-x-3 active:bg-gray-50 transition-colors"
        >
          <Settings className="w-5 h-5 text-gray-500" />
          <span className="font-medium text-gray-600">설정 (알림 및 기능 제어)</span>
        </button>

        <button
          onClick={sendVibrationSignal}
          className="w-full mt-4 bg-red-500 text-white p-4 rounded-2xl shadow-lg font-bold active:bg-red-600 transition-colors"
        >
          📳 진동 테스트 (누르면 폰이 떨려요)
        </button>
      </div>
    </div>
  );
}
