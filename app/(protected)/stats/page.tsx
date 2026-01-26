'use client';

import StatsContent from './StatsContent';

export default function StatsPage() {
  return (
    // PC에서는 별도 헤더 없이 그냥 내용만 보여주면 됨 (레이아웃이 알아서 처리)
    <StatsContent />
  );
}