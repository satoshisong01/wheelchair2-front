'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useMyWheelchair } from '../../../hooks/useMyWheelchair';
import { ChevronLeft, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';

// 📦 모바일용 상태 카드 컴포넌트
const MobileStatusCard = ({
  title,
  value,
  max,
  imageUrl,
  unit = '°',
  highlight = false,
  isDanger = false,
}: {
  title: string;
  value: string;
  max: string;
  imageUrl: string;
  unit?: string;
  highlight?: boolean;
  isDanger?: boolean;
}) => (
  <div 
    className={`
      flex flex-col justify-between p-4 rounded-2xl shadow-sm border transition-all duration-200
      ${highlight ? 'bg-indigo-50 border-indigo-200 ring-2 ring-indigo-300' : 
        isDanger ? 'bg-red-50 border-red-200 ring-2 ring-red-300' : 'bg-white border-gray-100'}
    `}
    style={{ minHeight: '180px' }}
  >
    {/* 1. 타이틀 & Max값 */}
    <div className="flex justify-between items-start">
      <span className={`text-sm font-bold ${highlight ? 'text-indigo-900' : 'text-gray-600'}`}>
        {title}
      </span>
      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
        Max {max}{unit}
      </span>
    </div>

    {/* 2. 이미지 (크게!) */}
    <div className="relative w-full h-20 my-3 flex items-center justify-center">
      {imageUrl && (
        <Image
          src={imageUrl}
          alt={title}
          width={80} 
          height={80}
          className="object-contain opacity-90"
          priority
        />
      )}
    </div>

    {/* 3. 값 표시 */}
    <div className="text-right mt-auto">
      <div className={`text-3xl font-bold ${highlight ? 'text-indigo-700' : isDanger ? 'text-red-700' : 'text-gray-800'}`}>
        {value}<span className="text-lg font-normal text-gray-500 ml-1">{unit}</span>
      </div>
    </div>
  </div>
);

export default function PosturePage() {
  const router = useRouter();
  const { data: wheelchairData } = useMyWheelchair();
  
  // 🟢 [핵심 수정] status를 any로 단언하여 snake_case 속성 접근 에러 방지
  const status = (wheelchairData?.status || {}) as any;

  // 🧪 [테스트 모드 상태]
  const [simulatedSeat, setSimulatedSeat] = useState(0);

  // 1. 데이터 매핑 (snake_case와 camelCase 모두 지원)
  // 값이 없으면 0 (시트 각도는 테스트 값을 기본으로)
  const valBack = status.angle_back ?? status.angleBack ?? 0;
  const valSeat = status.angle_seat ?? status.angleSeat ?? simulatedSeat; 
  const valFoot = status.foot_angle ?? status.footAngle ?? 0;
  const valElev = status.elevation_dist ?? status.elevationDist ?? 0;
  
  // 경사도 (DB 컬럼명에 따라 다를 수 있어 안전하게 처리)
  const valSlopeFr = status.slope_fr ?? status.inclineAngle ?? 0;
  const valSlopeSide = status.slope_side ?? status.incline_side ?? 0;

  // ⏱️ 타이머 로직
  const [timer, setTimer] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [isSuccessThisSession, setIsSuccessThisSession] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    // 시트 각도(valSeat)가 35도 이상일 때
    if (Number(valSeat) >= 35 && !isSuccessThisSession) {
      interval = setInterval(() => {
        setTimer((prev) => {
          if (prev >= 119) { // 120초(2분) 달성 시
            setSuccessCount(c => c + 1);
            setIsSuccessThisSession(true);
            return 120;
          }
          return prev + 1;
        });
      }, 1000);
    } else if (Number(valSeat) < 35) {
      // 35도 미만으로 내려가면 초기화
      setTimer(0);
      setIsSuccessThisSession(false);
    }
    return () => clearInterval(interval);
  }, [valSeat, isSuccessThisSession]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      
      {/* 헤더 */}
      <header className="bg-white px-4 py-4 shadow-sm flex items-center sticky top-0 z-10">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-600">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 ml-2">자세 정보 (임상)</h1>
      </header>

      <div className="flex-1 p-5 pb-20 overflow-y-auto">
        
        {/* 1. 메인: 욕창 예방 진행 상황 (타이머) */}
        <div className={`w-full rounded-3xl p-6 mb-8 shadow-md transition-all duration-300
          ${isSuccessThisSession 
            ? 'bg-gradient-to-br from-green-500 to-green-600 text-white'
            : Number(valSeat) >= 35 
              ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white'
              : 'bg-white border border-gray-100'
          }`}
        >
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className={`text-sm font-medium ${Number(valSeat) >= 35 ? 'text-indigo-100' : 'text-gray-500'}`}>
                욕창 예방 활동
              </p>
              <h2 className={`text-2xl font-bold mt-1 ${Number(valSeat) >= 35 ? 'text-white' : 'text-gray-800'}`}>
                {isSuccessThisSession ? '🎉 성공했습니다!' : 
                 Number(valSeat) >= 35 ? '유지해주세요...' : '안전 범위'}
              </h2>
            </div>
            <div className={`p-2 rounded-full ${Number(valSeat) >= 35 ? 'bg-white/20' : 'bg-gray-100'}`}>
              {isSuccessThisSession ? <CheckCircle2 className="text-white" /> : <RefreshCw className={Number(valSeat) >= 35 ? 'text-white animate-spin-slow' : 'text-gray-400'} />}
            </div>
          </div>

          {/* 타이머 바 */}
          {(Number(valSeat) >= 35 || isSuccessThisSession) && (
            <div className="mt-4">
              <div className="w-full bg-black/20 rounded-full h-3">
                <div 
                  className="bg-white rounded-full h-3 transition-all duration-1000"
                  style={{ width: `${(timer / 120) * 100}%` }}
                ></div>
              </div>
              <p className="text-center mt-2 font-mono text-xl font-bold">
                {Math.floor(timer / 60)}분 {timer % 60}초
              </p>
            </div>
          )}
          
          {Number(valSeat) < 35 && !isSuccessThisSession && (
             <div className="mt-4 flex items-center space-x-2 text-gray-500 text-sm">
               <AlertTriangle size={16} />
               <span>시트 각도를 35° 이상 올려보세요.</span>
             </div>
          )}
        </div>

        {/* 2. 상세 상태 그리드 (6개 항목) */}
        <h3 className="text-gray-700 font-bold mb-4 px-1 text-lg">휠체어 상세 상태</h3>
        <div className="grid grid-cols-2 gap-4 mb-6">
          
          {/* Row 1: 등받이, 시트 */}
          <MobileStatusCard 
            title="등받이 조절"
            imageUrl="/icons/secondtab/recline-height.svg"
            value={Number(valBack).toFixed(0)}
            max="180"
          />
          <MobileStatusCard 
            title="시트 조절"
            imageUrl="/icons/secondtab/tilt-adjustment.svg"
            value={Number(valSeat).toFixed(0)}
            max="45"
            highlight={Number(valSeat) >= 35}
          />

          {/* Row 2: 발판, 높이 */}
          <MobileStatusCard 
            title="발판 조절"
            imageUrl="/icons/secondtab/footrest-adjustment.svg"
            value={Number(valFoot).toFixed(0)}
            max="90"
          />
          <MobileStatusCard 
            title="높이 조절"
            imageUrl="/icons/secondtab/elevation-adjustment.svg"
            value={Number(valElev).toFixed(1)}
            max="30"
            unit="cm"
          />

          {/* Row 3: 전후방, 측면 */}
          <MobileStatusCard 
            title="전후방 경사"
            imageUrl="/icons/secondtab/front back tilt.svg"
            value={Number(valSlopeFr).toFixed(1)}
            max="20"
            isDanger={Math.abs(Number(valSlopeFr)) > 10}
          />
          <MobileStatusCard 
            title="측면 경사"
            imageUrl="/icons/secondtab/side tilt.svg"
            value={Number(valSlopeSide).toFixed(1)}
            max="20"
            isDanger={Math.abs(Number(valSlopeSide)) > 5}
          />
        </div>

        {/* 🛠️ 테스트 컨트롤러 */}
        <div className="bg-gray-800 rounded-2xl p-4 text-white mt-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-mono text-gray-400">TEST CONTROLLER</span>
            <span className="text-2xl font-bold text-yellow-400">{simulatedSeat}°</span>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => setSimulatedSeat(0)}
              className="px-4 py-3 bg-gray-700 rounded-xl text-sm font-medium"
            >
              초기화
            </button>
            <button 
              onClick={() => setSimulatedSeat(prev => prev + 5)}
              className="flex-1 py-3 bg-indigo-600 rounded-xl text-sm font-bold active:scale-95 transition-transform"
            >
              +5° 올리기
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}