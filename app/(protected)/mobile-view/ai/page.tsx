'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import StatsContent from '../../stats/StatsContent'; // ⭐️ 재사용!

export default function MobileAIPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      
      {/* 📱 모바일 전용 헤더 (뒤로가기 버튼) */}
      <header className="bg-white px-4 py-3 shadow-sm flex items-center sticky top-0 z-10 shrink-0">
        <button onClick={() => router.back()} className="p-1 text-gray-600">
          <ChevronLeft className="w-11 h-11" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 ml-2">패턴 분석</h1>
      </header>

      {/* ⭐️ 기존 통계 기능 그대로 가져오기 */}
      <div className="flex-1 overflow-y-auto">
        <StatsContent />
      </div>
      
    </div>
  );
}