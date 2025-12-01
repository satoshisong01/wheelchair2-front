'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { useSearchParams } from 'next/navigation';

import MapView from '@/components/maps/MapView';
import AlertList from '@/components/common/AlertList';
import styles from './page.module.css';
import { DashboardWheelchair, Alarm } from '@/types/wheelchair'; // 🚨 기존 import 유지
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

// ⭐️ [FIX] 최종 DetailData 타입 정의 (API 응답과 완벽 호환되도록 유연화)
// 이 타입이 모든 문제를 일으키던 원인이었습니다.
type WheelchairDetailData = DashboardWheelchair & {
  alarms: Alarm[];
  maintenanceLogs: any[];
  // 🚨 [핵심 FIX] status 타입이 API 응답 (snake_case)과 호환되도록 명시
  status: {
    current_battery: number;
    current_speed: number;
    voltage: number;
    current: number;
    latitude: number;
    longitude: number;

    // DB 컬럼명 (snake_case)
    angle_back?: number;
    angle_seat?: number;
    foot_angle?: number;
    elevation_dist?: number; // 높이 (cm)
    slope_fr?: number; // 전후방 경사 (A_FLRY)
    slope_side?: number; // 측면 경사 (A_FLRX)

    temperature?: number;
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
  // 🚨 detailData 상태 타입도 수정된 WheelchairDetailData를 사용
  const [detailData, setDetailData] = useState<WheelchairDetailData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);

  // ⭐️ [수정 1] 소켓 중복 연결 방지를 위한 ref
  const socketRef = useRef<Socket | null>(null);

  // ⭐️ [수정 2] 현재 보고 있는 ID를 ref로 관리
  const currentIdRef = useRef<string | null>(null);

  const userRole = (session?.user?.role as string) || '';
  const isManager = userRole === 'ADMIN' || userRole === 'MASTER';

  // 1. 데이터 로딩 (초기 상태 설정)
  useEffect(() => {
    if (status !== 'authenticated') return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const listRes = await fetch(`/api/wheelchairs?t=${Date.now()}`);
        if (!listRes.ok) throw new Error('목록 로딩 실패');

        // 🚨 [강제 타입 캐스팅] API 응답을 임시로 any로 받은 후 detailData에 할당
        const list: any[] = await listRes.json();
        setAllWheelchairs(list);

        const urlId = searchParams.get('id');
        let targetId = urlId;

        if (!targetId && list.length > 0) {
          targetId = list[0].id;
        }

        if (targetId) {
          currentIdRef.current = targetId;
          const selectedWc = list.find(
            (wc: any) => wc.id === targetId
          ) as WheelchairDetailData;
          if (selectedWc) {
            let fetchedAlarms: any[] = [];
            try {
              const alarmRes = await fetch(`/api/alarms`);
              if (alarmRes.ok) {
                const all = await alarmRes.json();
                // 🚨 [FIX] 알람 필터링 시 wheelchair_id / wheelchairId 둘 다 string으로 비교
                fetchedAlarms = all.filter(
                  (a: any) =>
                    String(a.wheelchairId || a.wheelchair_id) === targetId
                );
              }
            } catch (e) {}

            // 🚨 [FIX] detailData 할당 시, API에서 넘어온 status 객체 그대로 사용
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
  }, [status, searchParams]);

  // 2. 휠체어 선택 핸들러
  const handleSelectWheelchair = async (id: string) => {
    const selected = allWheelchairs.find((wc) => wc.id === id);
    if (selected) {
      currentIdRef.current = id;
      // 🚨 [FIX] alarms 필터링 로직 수정 (최신 타입 에러 해결)
      setDetailData((prev) =>
        prev
          ? ({
              ...selected,
              alarms: prev.alarms.filter(
                (a: any) => String(a.wheelchairId || a.wheelchair_id) === id
              ),
              maintenanceLogs: [],
            } as WheelchairDetailData) // ⭐️ [FINAL FIX] 타입스크립트에게 최종 타입을 명시적으로 알려줌
          : null
      );
    }
  };

  // 3. ⭐️ [핵심 수정] 소켓 연결
  useEffect(() => {
    if (socketRef.current || status !== 'authenticated') return;

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
      const currentTargetId = currentIdRef.current;

      if (
        currentTargetId &&
        (payload.wheelchairId === currentTargetId ||
          payload.wheelchair_id === currentTargetId)
      ) {
        setDetailData((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: {
              ...prev.status,
              // 🚨 [FIX] payload의 camelCase와 DB의 snake_case 호환 처리
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
              angle_back: payload.angleBack ?? prev.status.angle_back,
              angle_seat: payload.angleSeat ?? prev.status.angle_seat,
              foot_angle: payload.footAngle ?? prev.status.foot_angle,
              elevation_dist:
                payload.elevationDist ?? prev.status.elevation_dist,
              slope_fr: payload.slopeFr ?? prev.status.slope_fr,
              slope_side: payload.slopeSide ?? prev.status.slope_side,
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

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [status]);

  // --- UI ---
  if (status === 'loading' || isLoading) return <LoadingSpinner />;
  if (!detailData)
    return (
      <div className={styles.loadingContainer}>등록된 휠체어가 없습니다.</div>
    );

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
