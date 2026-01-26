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
  const { data: wheelchairData } = useMyWheelchair();
  const status = wheelchairData?.status || {};

  // 1. 위치 정보 (기본값: 서울 시청)
  const lat = status.latitude ? Number(status.latitude) : 37.5665;
  const lng = status.longitude ? Number(status.longitude) : 126.978;

  // 2. 날씨 상태 (초기값: 로딩 중 표시)
  const [weather, setWeather] = useState({
    temp: 0,
    humidity: 0,
    pressure: 0,
    main: 'Loading',
    desc: '불러오는 중...',
    city: '-',
    isWarning: false,
  });
  const [loading, setLoading] = useState(true);

  // 3. 내 서버 API 호출 (/api/weather)
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        // 클라이언트 -> 내 서버 API 호출
        const res = await fetch(`/api/weather?lat=${lat}&lon=${lng}`);

        if (!res.ok) throw new Error('Failed to fetch weather');

        const data = await res.json();

        setWeather({
          temp: data.temp,
          humidity: data.humidity,
          pressure: data.pressure || 1013, // 값이 없으면 표준 기압
          main: data.weather,
          desc: data.description,
          city: data.city,
          // 비(Rain), 눈(Snow), 천둥번개(Thunderstorm), 이슬비(Drizzle)일 때 경고 배너 표시
          isWarning: ['Rain', 'Snow', 'Thunderstorm', 'Drizzle'].includes(data.weather),
        });
      } catch (err) {
        console.error('날씨 데이터 로드 실패:', err);
        // 에러 시 기본값(더미)이라도 보여줌
        setWeather((prev) => ({ ...prev, desc: '정보 없음', temp: 0 }));
      } finally {
        setLoading(false);
      }
    };

    if (lat && lng) {
      fetchWeather();
    }
  }, [lat, lng]);

  // 날씨 아이콘 매핑 함수
  const getWeatherIcon = (main: string) => {
    switch (main) {
      case 'Clear':
        return <Sun className="w-8 h-8 text-orange-500" />;
      case 'Rain':
      case 'Drizzle':
        return <CloudRain className="w-8 h-8 text-blue-500" />;
      case 'Clouds':
        return <Cloud className="w-8 h-8 text-gray-500" />;
      case 'Snow':
        return <Wind className="w-8 h-8 text-sky-300" />;
      case 'Thunderstorm':
        return <CloudRain className="w-8 h-8 text-purple-600" />;
      default:
        return <Cloud className="w-8 h-8 text-gray-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 1. 헤더 */}
      <header className="bg-white px-4 py-4 shadow-sm flex items-center sticky top-0 z-10">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-600">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 ml-2">날씨 정보</h1>
      </header>

      {/* 2. 경고 배너 (비/눈 올 때만 표시) */}
      {!loading && weather.isWarning && (
        <div className="bg-yellow-400 px-6 py-3 flex items-center justify-center animate-fade-in-down">
          <span className="text-yellow-900 font-bold text-sm">
            ⚠️ 비/눈 예보가 있으니 주의하세요.
          </span>
        </div>
      )}

      <div className="flex-1 p-5 overflow-y-auto">
        {/* 3. 메인 그리드 (환경 정보) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-600">현재 환경</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">날씨 정보 로딩 중...</div>
          ) : (
            <div className="grid grid-cols-4 divide-x divide-gray-100">
              {/* 날씨 아이콘 */}
              <div className="p-4 flex flex-col items-center justify-center">
                <span className="text-xs text-gray-400 mb-2">날씨</span>
                {getWeatherIcon(weather.main)}
              </div>

              {/* 온도 */}
              <div className="p-4 flex flex-col items-center justify-center">
                <span className="text-xs text-gray-400 mb-2">온도</span>
                <div className="flex items-start">
                  <span className="text-xl font-bold text-gray-800">{weather.temp}</span>
                  <span className="text-xs text-gray-500 mt-0.5">°C</span>
                </div>
              </div>

              {/* 습도 */}
              <div className="p-4 flex flex-col items-center justify-center">
                <span className="text-xs text-gray-400 mb-2">습도</span>
                <div className="flex items-start">
                  <span className="text-xl font-bold text-gray-800">{weather.humidity}</span>
                  <span className="text-xs text-gray-500 mt-0.5">%</span>
                </div>
              </div>

              {/* 기압 */}
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

        {/* 4. GPS 상세 정보 카드 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-h-[300px] flex flex-col items-center justify-center text-center">
          <div className="bg-blue-50 p-4 rounded-full mb-4">
            <MapPin className="w-8 h-8 text-blue-600" />
          </div>

          <h3 className="text-lg font-bold text-gray-800 mb-2">GPS 기반 지역 날씨</h3>

          <p className="text-gray-500 text-sm mb-6 max-w-[200px] break-keep">
            현재 휠체어가 위치한 <strong>{weather.city || '알 수 없는 지역'}</strong>의 실시간 기상
            데이터입니다.
          </p>

          {/* 상세 리스트 */}
          <div className="w-full bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 flex items-center">
                <Thermometer size={14} className="mr-2" /> 상태
              </span>
              <span className="font-bold text-gray-700">{weather.desc}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 flex items-center">
                <Wind size={14} className="mr-2" /> 풍속
              </span>
              {/* 풍속은 API에서 줄 수도 있고 없으면 고정값/생략 */}
              <span className="font-bold text-gray-700">2.4 m/s</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 flex items-center">
                <Droplets size={14} className="mr-2" /> 습도
              </span>
              <span className="font-bold text-gray-700">{weather.humidity}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
