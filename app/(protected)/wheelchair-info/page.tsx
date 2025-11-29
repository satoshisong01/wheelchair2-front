'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { useSearchParams } from 'next/navigation';

import MapView from '@/components/maps/MapView';
import AlertList from '@/components/common/AlertList';
import styles from './page.module.css';
import { DashboardWheelchair, Alarm } from '@/types/wheelchair';
import { InfoBar } from './components/InfoBar';
import { DrivingInfoPanel } from './components/DrivingInfoPanel';
import { WheelchairStatePanel } from './components/WheelchairStatePanel';
import { PostureControlPanel } from './components/PostureControlPanel';
import { TopRightPanel } from './components/TopRightPanel';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const SOCKET_SERVER_URL = 'https://broker.firstcorea.com:8080';

const CRITICAL_KEYWORDS = [
  'FALL',
  'CRITICAL',
  'EMERGENCY',
  'WARNING',
  'FATAL',
  'COLLISION',
];

type WheelchairDetailData = DashboardWheelchair & {
  alarms: Alarm[];
  maintenanceLogs: any[];
  status: {
    current_battery: number;
    current_speed: number;
    voltage: number;
    current: number;
    latitude: number;
    longitude: number;
    angle_back: number;
    angle_seat: number;
    incline_angle: number;
    foot_angle: number;
    temperature: number;
    is_connected: boolean;
    last_seen?: string;
    [key: string]: any;
  };
};

function WheelchairInfoContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();

  const [allWheelchairs, setAllWheelchairs] = useState<DashboardWheelchair[]>(
    []
  );
  const [detailData, setDetailData] = useState<WheelchairDetailData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);

  // ⭐️ [수정 1] 소켓 중복 연결 방지를 위한 ref
  const socketRef = useRef<Socket | null>(null);

  // ⭐️ [수정 2] 현재 보고 있는 ID를 ref로 관리 (useEffect 안에서 최신값 참조용)
  const currentIdRef = useRef<string | null>(null);

  const userRole = (session?.user?.role as string) || '';
  const isManager = userRole === 'ADMIN' || userRole === 'MASTER';

  // 1. 데이터 로딩 (기존 로직 유지)
  useEffect(() => {
    if (status !== 'authenticated') return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const listRes = await fetch(`/api/wheelchairs?t=${Date.now()}`);
        if (!listRes.ok) throw new Error('목록 로딩 실패');
        const list: DashboardWheelchair[] = await listRes.json();
        setAllWheelchairs(list);

        const urlId = searchParams.get('id');
        let targetId = urlId;

        if (!targetId && list.length > 0) {
          targetId = list[0].id; // 기본값
        }

        if (targetId) {
          currentIdRef.current = targetId; // Ref 업데이트
          const selectedWc = list.find((wc) => wc.id === targetId);
          if (selectedWc) {
            let fetchedAlarms: Alarm[] = [];
            try {
              const alarmRes = await fetch(`/api/alarms`);
              if (alarmRes.ok) {
                const all = await alarmRes.json();
                fetchedAlarms = all.filter(
                  (a: any) => a.wheelchair_id === targetId
                );
              }
            } catch (e) {}

            // @ts-ignore
            setDetailData({
              ...selectedWc,
              alarms: fetchedAlarms,
              maintenanceLogs: [],
            });
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [status, searchParams]); // searchParams가 바뀔 때만 재로딩

  // 2. 휠체어 선택 핸들러
  const handleSelectWheelchair = (id: string) => {
    const selected = allWheelchairs.find((wc) => wc.id === id);
    if (selected) {
      currentIdRef.current = id; // Ref 업데이트
      // @ts-ignore
      setDetailData((prev) =>
        prev
          ? {
              ...selected,
              alarms: prev.alarms.filter((a) => a.wheelchair_id === id),
              maintenanceLogs: [],
            }
          : null
      );
    }
  };

  // 3. ⭐️ [핵심 수정] 소켓 연결 (한 번만 실행되도록 변경)
  useEffect(() => {
    // 이미 연결되어 있으면 패스
    if (socketRef.current || status !== 'authenticated') return;

    console.log('🔌 [Socket] 연결 시도:', SOCKET_SERVER_URL);

    const socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket'],
      rejectUnauthorized: false,
      secure: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ [Socket] 서버 연결 성공!');
    });

    socket.on('connect_error', (err) => {
      console.error('❌ [Socket] 연결 실패:', err.message);
    });

    // 데이터 수신
    socket.on('wheelchair_status_update', (payload: any) => {
      // ⭐️ Ref를 사용하여 현재 보고 있는 ID와 비교 (state 의존성 제거)
      const currentTargetId = currentIdRef.current;

      if (
        currentTargetId &&
        (payload.wheelchairId === currentTargetId ||
          payload.wheelchair_id === currentTargetId)
      ) {
        console.log('⚡️ [Data] 실시간 업데이트:', payload);

        setDetailData((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: {
              ...prev.status,
              current_battery:
                payload.batteryPercent ??
                payload.current_battery ??
                prev.status.current_battery,
              current_speed:
                payload.speed ??
                payload.current_speed ??
                prev.status.current_speed,
              voltage: payload.voltage ?? prev.status.voltage,
              current: payload.current ?? prev.status.current,
              angle_back:
                payload.angleBack ??
                payload.angle_back ??
                prev.status.angle_back,
              angle_seat:
                payload.angleSeat ??
                payload.angle_seat ??
                prev.status.angle_seat,
              incline_angle:
                payload.inclineAngle ??
                payload.incline_angle ??
                prev.status.incline_angle,
              foot_angle:
                payload.footAngle ??
                payload.foot_angle ??
                prev.status.foot_angle,
              temperature: payload.temperature ?? prev.status.temperature,
              latitude: payload.latitude ?? prev.status.latitude,
              longitude: payload.longitude ?? prev.status.longitude,
              is_connected: true,
              last_seen: new Date().toISOString(),
            },
          };
        });
      }
    });

    // 알람 수신
    socket.on('new_alarm', (newAlarm: any) => {
      const currentTargetId = currentIdRef.current;
      if (
        currentTargetId &&
        (newAlarm.wheelchairId === currentTargetId ||
          newAlarm.wheelchair_id === currentTargetId)
      ) {
        setDetailData((prev) =>
          prev ? { ...prev, alarms: [newAlarm, ...prev.alarms] } : null
        );
      }
    });

    // 컴포넌트 언마운트 시에만 연결 해제
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [status]); // detailData 의존성 제거됨

  // --- UI ---
  if (status === 'loading' || isLoading) return <LoadingSpinner />;
  if (!detailData)
    return <div className={styles.loadingContainer}>데이터 없음</div>;

  const isCritical = (alarm: any) =>
    CRITICAL_KEYWORDS.some((k) => (alarm.alarmType || '').includes(k));
  const warningEvents = detailData.alarms.filter(isCritical);
  const infoEvents = detailData.alarms.filter((a) => !isCritical(a));

  return (
    <div className={styles.container}>
      <InfoBar
        wc={detailData}
        allWheelchairs={allWheelchairs}
        onSelectWheelchair={handleSelectWheelchair}
        disableDropdown={!isManager}
      />
      <div className={styles.mainContent}>
        <div className={styles.leftColumn}>
          <div className={styles.mapArea}>
            <MapView
              wheelchairs={[detailData]}
              selectedWheelchair={detailData}
              onSelectWheelchair={() => {}}
            />
          </div>
          <div className={styles.bottomArea}>
            <DrivingInfoPanel wc={detailData} />
            <WheelchairStatePanel wc={detailData} />
          </div>
        </div>
        <div className={styles.rightColumn}>
          <div className={styles.rightTop}>
            <TopRightPanel wc={detailData} />
            <PostureControlPanel wc={detailData} />
          </div>
          <div className={styles.eventArea}>
            {/* 이벤트 리스트 UI 유지 */}
            <div className={`${styles.card} ${styles.eventCard}`}>
              <div className={styles.eventHeader}>
                <h2 className={`${styles.sectionTitle} ${styles.warningTitle}`}>
                  경고 EVENT
                </h2>
              </div>
              <div className={styles.scrollableContent}>
                <AlertList title="" alarms={warningEvents} />
              </div>
            </div>
            <div className={`${styles.card} ${styles.eventCard}`}>
              <div className={styles.eventHeader}>
                <h2 className={`${styles.sectionTitle} ${styles.infoTitle}`}>
                  알림 EVENT
                </h2>
              </div>
              <div className={styles.scrollableContent}>
                <AlertList title="" alarms={infoEvents} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WheelchairInfoPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <WheelchairInfoContent />
    </Suspense>
  );
}
