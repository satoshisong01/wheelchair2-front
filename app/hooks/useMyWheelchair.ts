import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { socket } from '@/lib/socket';
// 🔴 수정 전: import { Wheelchair } from '@/types/wheelchair';
// 🟢 수정 후: DashboardWheelchair (status 속성이 포함된 타입) 사용
import { DashboardWheelchair } from '@/types/wheelchair';

export function useMyWheelchair() {
  const { data: session } = useSession();

  // 🟢 State 타입도 DashboardWheelchair로 변경
  const [data, setData] = useState<DashboardWheelchair | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;

    // 1. 초기 데이터 가져오기
    const fetchData = async () => {
      try {
        const res = await fetch('/api/my-wheelchair');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (error) {
        console.error('Failed to fetch wheelchair data', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // 2. 소켓 연결
    if (!socket.connected) {
      socket.connect();
    }

    const handleStatusUpdate = (update: any) => {
      // 데이터 업데이트 로직
      setData((prev) => {
        if (!prev) return prev;

        // 기존 status가 null일 수 있으므로 안전하게 병합
        const currentStatus = prev.status || {};

        return {
          ...prev,
          status: {
            ...currentStatus,
            ...update,
          },
        } as DashboardWheelchair;
      });
    };

    socket.on('wheelchair_status_update', handleStatusUpdate);

    return () => {
      socket.off('wheelchair_status_update', handleStatusUpdate);
    };
  }, [session]);

  return { data, loading };
}
