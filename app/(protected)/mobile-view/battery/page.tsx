'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMyWheelchair } from '../../../hooks/useMyWheelchair';
import { useIsPowerOn } from '../../../hooks/useIsPowerOn';
import { hasValue } from '@/lib/format';
import { ChevronLeft, Zap, BatteryCharging, AlertTriangle, Clock, PlayCircle } from 'lucide-react';

// 📊 Chart.js 관련 임포트
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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
);

export default function BatteryPage() {
  const router = useRouter();
  const { data: wheelchairData, loading } = useMyWheelchair();
  const status = (wheelchairData?.status || {}) as any;
  const isPowerOn = useIsPowerOn(status, loading);

  // 1. 데이터 매핑 — 전원 OFF(60초 무통신)면 실시간 값은 '-'
  const batteryRaw = status.current_battery ?? status.battery;
  const hasBattery = isPowerOn && hasValue(batteryRaw);
  const batteryPercent = hasBattery ? Number(batteryRaw) : 0; // 링/차트/계산용 숫자
  const batteryText = hasBattery ? String(batteryPercent) : '-'; // 표시용

  const currentRaw = status.current_amperage ?? status.current;
  const current = isPowerOn && hasValue(currentRaw) ? Number(currentRaw) : 0;

  // 누적(오늘/총) 값 → 전원 OFF여도 유지
  const runtimeTotalMinutes = status.runtime ?? 0;
  const operatingTimeTotalMinutes =
    status.operating_time ?? status.operatingTime ?? 0;

  const isCharging = hasBattery && current > 0.5;
  const isLowBattery = hasBattery && batteryPercent < 20;

  // 계산 로직 (배터리 값 있을 때만, 없으면 '-')
  const estDistance = hasBattery ? (batteryPercent * 0.4).toFixed(1) : '-';
  const estTimeText = hasBattery
    ? `${Math.floor((batteryPercent * 0.8) / 60)}h ${Math.floor((batteryPercent * 0.8) % 60)}m`
    : '-';

  // 🟢 실제 오늘 주행 시간 계산 (분 -> 시/분 변환)
  const runTimeHours = Math.floor(runtimeTotalMinutes / 60);
  const runTimeMinutes = runtimeTotalMinutes % 60;

  // 🟢 휠체어 사용 시간 (분 -> 시/분 변환)
  const opTimeHours = Math.floor(operatingTimeTotalMinutes / 60);
  const opTimeMinutes = operatingTimeTotalMinutes % 60;

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
          backgroundColor: 'rgba(99, 102, 241, 0.2)',
          borderColor: 'rgb(99, 102, 241)',
          tension: 0.4,
          pointBackgroundColor: '#fff',
          pointBorderColor: 'rgb(99, 102, 241)',
          pointBorderWidth: 2,
        },
      ],
    });
  }, [chartPeriod, batteryPercent]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 11 } } },
      y: { min: 0, max: 100, grid: { color: '#f3f4f6' }, ticks: { display: false } },
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white px-4 py-3 shadow-sm flex items-center sticky top-0 z-10">
        <button onClick={() => router.back()} className="p-1 text-gray-600">
          <ChevronLeft className="w-11 h-11" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 ml-2">배터리 상세 정보</h1>
      </header>

      <div className="flex-1 p-6 pb-20 overflow-y-auto flex flex-col items-center">
        {/* 1. 메인 배터리 그래픽 */}
        <div className="relative w-64 h-64 flex items-center justify-center my-4">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="128"
              cy="128"
              r="110"
              stroke="#E5E7EB"
              strokeWidth="24"
              fill="transparent"
            />
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
            <span
              className={`text-6xl font-black ${isLowBattery ? 'text-red-600' : 'text-gray-800'}`}
            >
              {batteryText}
              {hasBattery && <span className="text-3xl text-gray-400 font-medium">%</span>}
            </span>
          </div>
        </div>

        {/* 2. 상태 메시지 */}
        <div
          className={`w-full p-4 rounded-2xl mb-6 flex items-start space-x-3
          ${
            !hasBattery
              ? 'bg-gray-50 text-gray-600 border border-gray-100'
              : isLowBattery
                ? 'bg-red-50 text-red-800 border border-red-100'
                : isCharging
                  ? 'bg-green-50 text-green-800 border border-green-100'
                  : 'bg-blue-50 text-blue-800 border border-blue-100'
          }`}
        >
          {!hasBattery ? (
            <AlertTriangle className="w-6 h-6 shrink-0 text-gray-400" />
          ) : isLowBattery ? (
            <AlertTriangle className="w-6 h-6 shrink-0" />
          ) : isCharging ? (
            <BatteryCharging className="w-6 h-6 shrink-0" />
          ) : (
            <Zap className="w-6 h-6 shrink-0" />
          )}
          <div>
            <h3 className="font-bold text-lg">
              {!hasBattery
                ? isPowerOn
                  ? '데이터 없음'
                  : '통신 끊김 (전원 OFF)'
                : isLowBattery
                  ? '충전이 필요합니다!'
                  : isCharging
                    ? '고속 충전 중입니다.'
                    : '정상 운행 중입니다.'}
            </h3>
            <p className="text-sm opacity-90 mt-1">
              {!hasBattery
                ? '기기에서 배터리 데이터가 수신되지 않습니다.'
                : isLowBattery
                  ? '배터리 잔량이 20% 미만입니다.'
                  : isCharging
                    ? '완충까지 잠시만 기다려주세요.'
                    : '배터리 상태가 양호합니다.'}
            </p>
          </div>
        </div>

        {/* 3. 주행 정보 (3단 그리드로 확장) */}
        <div className="grid grid-cols-1 gap-3 w-full mb-8">
          <div className="flex space-x-3">
            <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
              <span className="text-gray-500 text-[10px] font-medium block mb-1 uppercase">
                주행 가능 거리
              </span>
              <div className="flex items-end">
                <span className="text-xl font-bold text-gray-900">{estDistance}</span>
                {hasBattery && <span className="text-xs text-gray-500 ml-1 mb-1">m</span>}
              </div>
            </div>
            <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 ring-1 ring-indigo-50">
              <span className="text-indigo-600 text-[10px] font-bold block mb-1 uppercase">
                오늘 주행 시간
              </span>
              <div className="flex items-end">
                <span className="text-xl font-bold text-gray-900">{runTimeHours}</span>
                <span className="text-xs text-gray-500 ml-0.5 mb-1 mr-1">h</span>
                <span className="text-xl font-bold text-gray-900">{runTimeMinutes}</span>
                <span className="text-xs text-gray-500 ml-0.5 mb-1">m</span>
              </div>
            </div>
          </div>
          <div className="flex space-x-3">
            <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
              <span className="text-gray-500 text-[10px] font-medium block mb-1 uppercase">
                휠체어 사용 시간
              </span>
              <div className="flex items-end">
                <span className="text-xl font-bold text-gray-900">{opTimeHours}</span>
                <span className="text-xs text-gray-500 ml-0.5 mb-1 mr-1">h</span>
                <span className="text-xl font-bold text-gray-900">{opTimeMinutes}</span>
                <span className="text-xs text-gray-500 ml-0.5 mb-1">m</span>
              </div>
            </div>
            <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
              <span className="text-gray-500 text-[10px] font-medium block mb-1 uppercase flex items-center">
                <Clock className="w-3 h-3 mr-1" /> 예상 사용 가능 시간
              </span>
              <div className="flex items-end">
                <span className="text-xl font-bold text-gray-900">{estTimeText}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. 사용 내역 그래프 */}
        <div className="w-full bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-gray-800 flex items-center text-sm">
              <PlayCircle className="w-4 h-4 mr-2 text-indigo-500" />
              배터리 효율 트렌드
            </h3>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setChartPeriod('today')}
                className={`px-3 py-1 rounded-md text-[10px] font-medium transition-all ${chartPeriod === 'today' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}
              >
                오늘
              </button>
              <button
                onClick={() => setChartPeriod('week')}
                className={`px-3 py-1 rounded-md text-[10px] font-medium transition-all ${chartPeriod === 'week' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}
              >
                1주일
              </button>
            </div>
          </div>
          <div className="h-40 w-full">
            {chartData && <Line options={chartOptions} data={chartData} />}
          </div>
        </div>
      </div>
    </div>
  );
}
