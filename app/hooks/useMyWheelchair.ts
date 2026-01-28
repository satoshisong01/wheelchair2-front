import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { socket } from '@/lib/socket';
import { DashboardWheelchair } from '@/types/wheelchair';

export function useMyWheelchair() {
  const { data: session } = useSession();

  const [data, setData] = useState<DashboardWheelchair | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;

    // 1. 초기 데이터 가져오기 (날씨 및 알림 설정 포함)
    const fetchData = async () => {
      try {
        // 🟢 /api/device-info를 통해 시리얼 번호와 함께 status(날씨, 설정 등)를 한꺼번에 가져옵니다.
        const res = await fetch('/api/device-info');
        if (res.ok) {
          const json = await res.json();
          // API 응답 형식이 { serial, status } 인 경우 DashboardWheelchair 형식에 맞게 변환
          setData({
            ...json,
            // API 응답의 status를 초기 상태로 저장
            status: json.status || {},
          } as DashboardWheelchair);
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

    // 실시간 상태 업데이트 처리
    const handleStatusUpdate = (update: any) => {
      setData((prev) => {
        if (!prev) return prev;

        // 기존에 DB에서 불러온 정보(날씨, 알림 설정 등)를 유지하면서
        // 소켓으로 들어온 실시간 센서 데이터만 덮어씁니다.
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
