'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMyWheelchair } from '../../../hooks/useMyWheelchair';
import { ChevronLeft, Zap, BatteryCharging, AlertTriangle, Clock } from 'lucide-react';

// 📊 Chart.js 관련 임포트 (기존 라이브러리 활용)
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Chart.js 플러그인 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend
);

export default function BatteryPage() {
  const router = useRouter();
  const { data: wheelchairData } = useMyWheelchair();
  const status = (wheelchairData?.status || {}) as any;

  // 1. 데이터 매핑
  const batteryPercent = status.current_battery ?? status.battery ?? 0;
  const current = status.current_amperage ?? status.current ?? 0;
  
  const isCharging = current > 0.5; 
  const isLowBattery = batteryPercent < 20;

  const estDistance = (batteryPercent * 0.4).toFixed(1); 
  const estTimeHours = Math.floor((batteryPercent * 0.8) / 60);
  const estTimeMinutes = Math.floor((batteryPercent * 0.8) % 60);

  // 📊 2. 그래프 데이터 상태
  const [chartPeriod, setChartPeriod] = useState<'today' | 'week'>('today');
  const [chartData, setChartData] = useState<any>(null);

  // 3. 차트 데이터 설정 (시뮬레이션)
  useEffect(() => {
    let labels = [];
    let data = [];

    if (chartPeriod === 'today') {
      labels = ['09시', '11시', '13시', '15시', '17시', '19시', '현재'];
      data = [95, 88, 75, 60, 55, 40, batteryPercent];
    } else {
      labels = ['월', '화', '수', '목', '금', '토', '일'];
      data = [80, 75, 60, 90, 85, 50, batteryPercent];
    }

    setChartData({
      labels,
      datasets: [
        {
          label: '배터리 잔량 (%)',
          data: data,
          fill: true,
          backgroundColor: 'rgba(99, 102, 241, 0.2)', // indigo-500 투명도
          borderColor: 'rgb(99, 102, 241)',
          tension: 0.4, // 곡선 부드럽게
          pointBackgroundColor: '#fff',
          pointBorderColor: 'rgb(99, 102, 241)',
          pointBorderWidth: 2,
        },
      ],
    });
  }, [chartPeriod, batteryPercent]);

  // 차트 옵션 (심플하게)
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }, // 범례 숨김
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#9ca3af', font: { size: 11 } }
      },
      y: {
        min: 0,
        max: 100,
        grid: { color: '#f3f4f6' }, // 연한 회색 그리드
        ticks: { display: false } // Y축 숫자 숨김 (깔끔하게)
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      
      {/* 헤더 */}
      <header className="bg-white px-4 py-4 shadow-sm flex items-center sticky top-0 z-10">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-600">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 ml-2">배터리 상세 정보</h1>
      </header>

      <div className="flex-1 p-6 pb-20 overflow-y-auto flex flex-col items-center">
        
        {/* 1. 메인 배터리 그래픽 (원형) */}
        <div className="relative w-64 h-64 flex items-center justify-center my-4">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="128" cy="128" r="110" stroke="#E5E7EB" strokeWidth="24" fill="transparent" />
            <circle
              cx="128"
              cy="128"
              r="110"
              stroke={isLowBattery ? '#EF4444' : isCharging ? '#10B981' : '#3B82F6'}
              strokeWidth="24"
              fill="transparent"
              strokeDasharray={2 * Math.PI * 110}
              strokeDashoffset={2 * Math.PI * 110 * (1 - batteryPercent / 100)}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            {isCharging && (
              <div className="flex items-center text-green-600 mb-1 animate-pulse">
                <Zap className="w-5 h-5 fill-current" />
                <span className="text-sm font-bold">충전 중</span>
              </div>
            )}
            <span className={`text-6xl font-black ${isLowBattery ? 'text-red-600' : 'text-gray-800'}`}>
              {batteryPercent}
              <span className="text-3xl text-gray-400 font-medium">%</span>
            </span>
          </div>
        </div>

        {/* 2. 상태 메시지 */}
        <div className={`w-full p-4 rounded-2xl mb-6 flex items-start space-x-3
          ${isLowBattery ? 'bg-red-50 text-red-800 border border-red-100' : 
            isCharging ? 'bg-green-50 text-green-800 border border-green-100' : 
            'bg-blue-50 text-blue-800 border border-blue-100'}`}
        >
          {isLowBattery ? <AlertTriangle className="w-6 h-6 shrink-0" /> : 
           isCharging ? <BatteryCharging className="w-6 h-6 shrink-0" /> : 
           <Zap className="w-6 h-6 shrink-0" />}
          <div>
            <h3 className="font-bold text-lg">
              {isLowBattery ? '충전이 필요합니다!' : 
               isCharging ? '고속 충전 중입니다.' : '정상 운행 중입니다.'}
            </h3>
            <p className="text-sm opacity-90 mt-1">
              {isLowBattery ? '배터리 잔량이 20% 미만입니다.' : 
               isCharging ? '완충까지 잠시만 기다려주세요.' : '배터리 상태가 양호합니다.'}
            </p>
          </div>
        </div>

        {/* 3. 주행 정보 */}
        <div className="grid grid-cols-2 gap-3 w-full mb-8">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <span className="text-gray-500 text-xs font-medium block mb-2">주행 가능 거리</span>
            <div className="flex items-end">
              <span className="text-2xl font-bold text-gray-900">{estDistance}</span>
              <span className="text-sm text-gray-500 ml-1 mb-1">km</span>
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <span className="text-gray-500 text-xs font-medium block mb-2">사용 가능 시간</span>
            <div className="flex items-end">
              <span className="text-2xl font-bold text-gray-900">{estTimeHours}</span>
              <span className="text-sm text-gray-500 ml-0.5 mb-1">h</span>
              <span className="text-2xl font-bold text-gray-900 ml-1">{estTimeMinutes}</span>
              <span className="text-sm text-gray-500 ml-0.5 mb-1">m</span>
            </div>
          </div>
        </div>

        {/* 4. 사용 내역 그래프 (Chart.js) */}
        <div className="w-full bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-gray-800 flex items-center">
              <Clock className="w-4 h-4 mr-2 text-indigo-500" />
              배터리 사용 내역
            </h3>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button 
                onClick={() => setChartPeriod('today')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all
                  ${chartPeriod === 'today' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}
              >
                오늘
              </button>
              <button 
                onClick={() => setChartPeriod('week')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all
                  ${chartPeriod === 'week' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}
              >
                1주일
              </button>
            </div>
          </div>
          
          <div className="h-48 w-full">
            {chartData && <Line options={chartOptions} data={chartData} />}
          </div>
        </div>

      </div>
    </div>
  );
}