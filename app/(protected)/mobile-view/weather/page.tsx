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
  Home, // 실내 아이콘 추가
} from 'lucide-react';

export default function WeatherPage() {
  const router = useRouter();
  const { data: wheelchairData, loading: dataLoading } = useMyWheelchair();
  const status = (wheelchairData?.status || {}) as any;

  // 1. 날씨 상태 관리
  const [weather, setWeather] = useState({
    outdoorTemp: '-', // 🟢 외부 기온 (API)
    indoorTemp: '-', // 🟢 실내/센서 기온 (DB)
    humidity: 0,
    pressure: 0,
    main: 'Clear',
    desc: '맑음',
    isWarning: false,
  });

  // 2. 데이터 매핑 (API vs 센서값 분리)
  useEffect(() => {
    if (status) {
      setWeather({
        // 🟢 외부 기온: outdoor_temp가 있으면 사용, 없으면 '-'
        outdoorTemp:
          status.outdoor_temp !== undefined ? Number(status.outdoor_temp).toFixed(1) : '-',

        // 🟢 실내(센서) 기온: temperature 사용
        indoorTemp: status.temperature ? Number(status.temperature).toFixed(1) : '0.0',

        humidity: status.humidity || 0,
        pressure: status.pressure || 1013,

        main: status.weather_desc?.includes('비') ? 'Rain' : 'Clear',
        desc: status.weather_desc || '정보 없음',

        isWarning: ['비', '눈', '소나기'].some((word) => status.weather_desc?.includes(word)),
      });
    }
  }, [
    status.outdoor_temp,
    status.temperature,
    status.weather_desc,
    status.humidity,
    status.pressure,
  ]);

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
            <h2 className="text-sm font-bold text-gray-600">실시간 온도 비교</h2>
          </div>

          {dataLoading ? (
            <div className="p-8 text-center text-gray-400 text-sm">데이터 수신 중...</div>
          ) : (
            <div className="grid grid-cols-4 divide-x divide-gray-100">
              {/* 1. 상태 아이콘 */}
              <div className="p-4 flex flex-col items-center justify-center">
                <span className="text-xs text-gray-400 mb-2">기상</span>
                {getWeatherIcon(weather.main)}
              </div>

              {/* 2. 외부 기온 (API) */}
              <div className="p-4 flex flex-col items-center justify-center bg-blue-50 bg-opacity-30">
                <span className="text-xs text-blue-500 font-bold mb-2">외부</span>
                <div className="flex items-start">
                  <span className="text-xl font-bold text-gray-800">{weather.outdoorTemp}</span>
                  <span className="text-xs text-gray-500 mt-0.5">°C</span>
                </div>
              </div>

              {/* 3. 실내/센서 기온 (DB) - 🟢 추가된 부분 */}
              <div className="p-4 flex flex-col items-center justify-center bg-orange-50 bg-opacity-30">
                <span className="text-xs text-orange-500 font-bold mb-2">실내(센서)</span>
                <div className="flex items-start">
                  <span className="text-xl font-bold text-gray-800">{weather.indoorTemp}</span>
                  <span className="text-xs text-gray-500 mt-0.5">°C</span>
                </div>
              </div>

              {/* 4. 습도 (기압 대신 습도 배치) */}
              <div className="p-4 flex flex-col items-center justify-center">
                <span className="text-xs text-gray-400 mb-2">습도</span>
                <div className="flex items-start">
                  <span className="text-xl font-bold text-gray-800">{weather.humidity}</span>
                  <span className="text-xs text-gray-500 mt-0.5">%</span>
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

          <h3 className="text-lg font-bold text-gray-800 mb-2">환경 데이터 상세</h3>

          <p className="text-gray-500 text-sm mb-6 max-w-[240px] break-keep">
            <strong>외부 기온</strong>은 기상청 데이터를, <br />
            <strong>실내 기온</strong>은 휠체어 센서 데이터를 표시합니다.
          </p>

          <div className="w-full bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 flex items-center">
                <Cloud size={14} className="mr-2" /> 날씨 설명
              </span>
              <span className="font-bold text-gray-700">{weather.desc}</span>
            </div>

            {/* 하단 상세에 기압 정보 추가 (상단에서 빠진 대신) */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 flex items-center">
                <Wind size={14} className="mr-2" /> 대기압
              </span>
              <span className="font-bold text-gray-700">{weather.pressure} hPa</span>
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 flex items-center">
                <Droplets size={14} className="mr-2" /> 주변 습도
              </span>
              <span className="font-bold text-gray-700">{weather.humidity}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
