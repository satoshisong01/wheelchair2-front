'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import styles from './page.module.css';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

// Chart.js 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// ‼️ [수정] API 응답에 맞는 타입 정의 (배열이 아니라 객체입니다)
interface StatsResponse {
  labels: string[];
  battery: number[];
  speed: number[];
  distance: number[];
}

export default function StatsPage() {
  const { data: session, status } = useSession();

  // 차트 데이터 상태
  const [chartData, setChartData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. 데이터 로딩
  useEffect(() => {
    if (status === 'authenticated') {
      const fetchStats = async () => {
        setIsLoading(true);
        try {
          // 1-1. 타겟 휠체어 ID 결정
          let targetId = '';

          // (A) 기기 사용자: 내 ID 사용
          if (session.user.role === 'DEVICE_USER') {
            targetId = String(session.user.wheelchairId);
          }
          // (B) 관리자: (일단 편의상) 휠체어 목록을 가져와서 첫 번째 휠체어 ID 사용
          // ‼️ 실제로는 상단에 드롭다운을 만들어 선택하게 해야 하지만, 일단 에러 해결을 위해 자동 선택 로직 적용
          else if (
            session.user.role === 'ADMIN' ||
            session.user.role === 'MASTER'
          ) {
            const listRes = await fetch('/api/wheelchairs');
            if (!listRes.ok) throw new Error('휠체어 목록 조회 실패');
            const list = await listRes.json();
            if (list.length > 0) {
              targetId = String(list[0].id);
            } else {
              throw new Error('등록된 휠체어가 없습니다.');
            }
          }

          if (!targetId) throw new Error('조회할 휠체어 ID가 없습니다.');

          // 1-2. 통계 데이터 요청
          const res = await fetch(`/api/stats/${targetId}?range=1d`);
          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.message || '통계 데이터 조회 실패');
          }

          // ‼️ [핵심 수정] API가 준 데이터를 그대로 받음 (이미 labels, battery 배열이 들어있음)
          const data: StatsResponse = await res.json();

          // 1-3. 차트 데이터 구성 (map 함수 필요 없음!)
          setChartData({
            labels: data.labels, // ‼️ API가 준 라벨 배열 그대로 사용
            datasets: [
              {
                label: '배터리 (%)',
                data: data.battery, // ‼️ API가 준 데이터 배열 그대로 사용
                borderColor: 'rgb(53, 162, 235)',
                backgroundColor: 'rgba(53, 162, 235, 0.5)',
                yAxisID: 'y',
              },
              {
                label: '속도 (km/h)',
                data: data.speed,
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                yAxisID: 'y1',
              },
            ],
          });
        } catch (err: any) {
          console.error(err);
          setError(err.message);
        } finally {
          setIsLoading(false);
        }
      };

      fetchStats();
    }
  }, [status, session]);

  // 차트 옵션
  const options = {
    responsive: true,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    stacked: false,
    plugins: {
      title: {
        display: true,
        text: '실시간 휠체어 상태 (최근 24시간)',
      },
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: { display: true, text: '배터리 (%)' },
        min: 0,
        max: 100,
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: { display: true, text: '속도 (km/h)' },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  // 렌더링
  if (status === 'loading' || isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className={styles.container}>
        <p className={styles.error}>오류: {error}</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>통계 그래프</h1>
      <div className={styles.chartWrapper}>
        {chartData ? (
          <Line options={options} data={chartData} />
        ) : (
          <p>데이터가 없습니다.</p>
        )}
      </div>
    </div>
  );
}
