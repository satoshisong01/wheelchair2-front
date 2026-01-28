'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMyWheelchair } from '../../../hooks/useMyWheelchair';
import {
  ChevronLeft,
  Cloud,
  CloudRain,
  Sun,
  Wind,
  Droplets,
  Thermometer,
  MapPin,
} from 'lucide-react';

export default function WeatherPage() {
  const router = useRouter();
  const { data: wheelchairData, loading: dataLoading } = useMyWheelchair();
  const status = (wheelchairData?.status || {}) as any;

  // 1. 날씨 상태 관리
  const [weather, setWeather] = useState({
    temp: 0,
    humidity: 0,
    pressure: 0,
    main: 'Clear',
    desc: '맑음',
    city: '실시간 위치',
    isWarning: false,
  });

  // 2. 🟢 [수정] 외부 날씨(온도/상태) + 기기 센서(습도/기압) 데이터 결합
  useEffect(() => {
    if (status) {
      setWeather({
        // 온도는 외부 날씨 API(outdoor_temp)를 우선하되, 없으면 센서 온도 사용
        temp:
          status.outdoor_temp !== undefined
            ? Number(status.outdoor_temp).toFixed(1)
            : status.temperature || 0,

        // 🔹 습도와 기압은 휠체어 센서에서 보내주는 실시간 값 사용
        humidity: status.humidity || 0,
        pressure: status.pressure || 1013,

        main: status.weather_desc?.includes('비') ? 'Rain' : 'Clear',
        desc: status.weather_desc || '정보 없음',
        city: '실시간 위치',
        // 기상 경보 확인
        isWarning: ['비', '눈', '소나기'].some((word) => status.weather_desc?.includes(word)),
      });
    }
  }, [status.outdoor_temp, status.weather_desc, status.humidity, status.pressure]);

  const getWeatherIcon = (main: string) => {
    if (weather.desc.includes('비')) return <CloudRain className="w-8 h-8 text-blue-500" />;
    if (weather.desc.includes('구름')) return <Cloud className="w-8 h-8 text-gray-500" />;
    if (weather.desc.includes('눈')) return <Wind className="w-8 h-8 text-sky-300" />;
    return <Sun className="w-8 h-8 text-orange-500" />;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white px-4 py-4 shadow-sm flex items-center sticky top-0 z-10">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-600">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 ml-2">날씨 및 환경 정보</h1>
      </header>

      {!dataLoading && weather.isWarning && (
        <div className="bg-yellow-400 px-6 py-3 flex items-center justify-center">
          <span className="text-yellow-900 font-bold text-sm">
            ⚠️ 외부 기상이 좋지 않으니 주행에 주의하세요.
          </span>
        </div>
      )}

      <div className="flex-1 p-5 overflow-y-auto">
        {/* 3. 메인 그리드 (실시간 환경 정보) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-600">현재 주변 환경 (센서 동기화)</h2>
          </div>

          {dataLoading ? (
            <div className="p-8 text-center text-gray-400 text-sm">데이터 수신 중...</div>
          ) : (
            <div className="grid grid-cols-4 divide-x divide-gray-100">
              <div className="p-4 flex flex-col items-center justify-center">
                <span className="text-xs text-gray-400 mb-2">상태</span>
                {getWeatherIcon(weather.main)}
              </div>
              <div className="p-4 flex flex-col items-center justify-center">
                <span className="text-xs text-gray-400 mb-2">기온</span>
                <div className="flex items-start">
                  <span className="text-xl font-bold text-gray-800">{weather.temp}</span>
                  <span className="text-xs text-gray-500 mt-0.5">°C</span>
                </div>
              </div>
              <div className="p-4 flex flex-col items-center justify-center">
                <span className="text-xs text-gray-400 mb-2">습도</span>
                <div className="flex items-start">
                  <span className="text-xl font-bold text-gray-800">{weather.humidity}</span>
                  <span className="text-xs text-gray-500 mt-0.5">%</span>
                </div>
              </div>
              <div className="p-4 flex flex-col items-center justify-center">
                <span className="text-xs text-gray-400 mb-2">기압</span>
                <div className="flex items-start">
                  <span className="text-lg font-bold text-gray-800">{weather.pressure}</span>
                  <span className="text-[10px] text-gray-500 mt-1 ml-0.5">hPa</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. 센서 상세 정보 카드 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-h-[300px] flex flex-col items-center justify-center text-center">
          <div className="bg-blue-50 p-4 rounded-full mb-4">
            <MapPin className="w-8 h-8 text-blue-600" />
          </div>

          <h3 className="text-lg font-bold text-gray-800 mb-2">기기 센서 기반 정보</h3>

          <p className="text-gray-500 text-sm mb-6 max-w-[200px] break-keep">
            휠체어에 탑재된 센서가 측정하는 <strong>실시간 주변 환경</strong> 데이터입니다.
          </p>

          <div className="w-full bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 flex items-center">
                <Thermometer size={14} className="mr-2" /> 외부 날씨
              </span>
              <span className="font-bold text-gray-700">{weather.desc}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 flex items-center">
                <Wind size={14} className="mr-2" /> 주변 온도 (센서)
              </span>
              <span className="font-bold text-gray-700">{status.temperature}°C</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 flex items-center">
                <Droplets size={14} className="mr-2" /> 주변 습도 (센서)
              </span>
              <span className="font-bold text-gray-700">{weather.humidity}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
