// 경로: app/(protected)/wheelchair-info/page.tsx

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
import PostureSafetyMonitor from './components/PostureSafetyMonitor';

const SOCKET_SERVER_URL = 'https://broker.firstcorea.com:8080';

const CRITICAL_KEYWORDS = ['FALL', 'CRITICAL', 'EMERGENCY', 'WARNING', 'FATAL', 'COLLISION'];

// 타입 정의
type WheelchairDetailData = DashboardWheelchair & {
  alarms: Alarm[];
  maintenanceLogs: any[];
  status: {
    // ... (기존 status 필드들)
    current_battery: number;
    current_speed: number;
    voltage: number;
    current: number;
    latitude: number;
    longitude: number;
    angle_back?: number;
    angle_seat?: number;
    foot_angle?: number;
    elevation_dist?: number;
    slope_fr?: number;
    slope_side?: number;
    temperature?: number;
    humidity?: number;
    pressure?: number;
    is_connected: boolean;
    last_seen?: string;
    // 🟢 [수정] Worker에서 'light'로 오므로 light 필드 중요
    light?: number;
    posture_time?: number;
    operating_time?: number;
    runtime?: number;
    distance?: number;
    [key: string]: any;
  };
};

function WheelchairInfoContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();

  const [allWheelchairs, setAllWheelchairs] = useState<DashboardWheelchair[]>([]);
  const [detailData, setDetailData] = useState<WheelchairDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [postureAdviceAt, setPostureAdviceAt] = useState<Date | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const currentIdRef = useRef<string | null>(null);

  const userRole = (session?.user?.role as string) || '';
  const isManager = userRole === 'ADMIN' || userRole === 'MASTER';

  // 1. 초기 데이터 로딩
  useEffect(() => {
    if (status !== 'authenticated') return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 1. 휠체어 목록 가져오기
        const listRes = await fetch(`/api/wheelchairs?t=${Date.now()}`);
        if (!listRes.ok) throw new Error('목록 로딩 실패');
        const list: any[] = await listRes.json();
        setAllWheelchairs(list);

        // 2. 현재 선택된 ID 결정
        const urlId = searchParams.get('id');
        let targetId = urlId;
        if (!targetId && list.length > 0) {
          targetId = list[0].id;
        }

        if (targetId) {
          currentIdRef.current = String(targetId);
          const selectedWc = list.find(
            (wc: any) => String(wc.id) === String(targetId),
          ) as WheelchairDetailData;

          if (selectedWc) {
            let fetchedAlarms: any[] = [];
            try {
              // 3. 알람 가져오기
              const alarmRes = await fetch(`/api/alarms?t=${Date.now()}`, {
                cache: 'no-store',
                headers: {
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                  Pragma: 'no-cache',
                  Expires: '0',
                },
              });
              if (alarmRes.ok) {
                const allAlarms = await alarmRes.json();
                fetchedAlarms = allAlarms.filter(
                  (a: any) => String(a.wheelchairId || a.wheelchair_id) === String(targetId),
                );
              }
            } catch (e) {
              console.error('알람 로딩 실패', e);
            }

            // POSTURE_ADVICE는 "수신 시점"에만 팝업을 띄우도록 합니다.
            setPostureAdviceAt(null);

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
    const selected = allWheelchairs.find((wc) => String(wc.id) === String(id));
    if (selected) {
      currentIdRef.current = String(id);
      setPostureAdviceAt(null);

      let fetchedAlarms: any[] = [];
      try {
        const alarmRes = await fetch(`/api/alarms?t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        });
        if (alarmRes.ok) {
          const allAlarms = await alarmRes.json();
          fetchedAlarms = allAlarms.filter(
            (a: any) => String(a.wheelchairId || a.wheelchair_id) === String(id),
          );
        }
      } catch (e) {}

      // POSTURE_ADVICE는 소켓 수신 시점에만 팝업을 띄웁니다.
      setPostureAdviceAt(null);

      setDetailData({
        ...selected,
        alarms: fetchedAlarms,
        maintenanceLogs: [],
      } as WheelchairDetailData);
    }
  };

  // 3. 소켓 연결 및 데이터 수신
  useEffect(() => {
    if (socketRef.current || status !== 'authenticated') return;

    const socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket'],
      rejectUnauthorized: false,
      secure: true,
    });

    socketRef.current = socket;

    // 상태 업데이트 수신 (핵심 수정 부분)
    socket.on('wheelchair_status_update', (payload: any) => {
      const currentTargetId = currentIdRef.current;

      // ID 비교
      if (
        currentTargetId &&
        String(payload.wheelchairId || payload.wheelchair_id) === String(currentTargetId)
      ) {
        setDetailData((prev) => {
          if (!prev) return null;

          return {
            ...prev,
            status: {
              // 🟢 [핵심] 기존 데이터(prev.status)를 먼저 깔아서 사라짐 방지
              ...prev.status,

              // 🟢 [매핑] payload에 값이 있을 때만 업데이트 (null check)

              // 1. 배터리/속도/전압/전류
              current_battery: payload.batteryPercent ?? prev.status.current_battery,
              current_speed: payload.speed ?? prev.status.current_speed,
              voltage: payload.voltage ?? prev.status.voltage,
              current: payload.current ?? prev.status.current,

              // 2. 주행 데이터 (CW/st)
              runtime: payload.runtime ?? prev.status.runtime, // 주행 시간
              distance: payload.distance ?? prev.status.distance, // 주행 거리

              // 2-0. 욕창 예방 카운트 (POSTURE_COMPLETE에서 증가)
              ulcer_count: payload.ulcerCount ?? payload.ulcer_count,

              // 3. 장기 데이터 (CW/lt)
              // ⭐️ Worker는 'light'로 보내므로 payload.light를 받아서 status.light에 저장
              light: payload.light ?? prev.status.light,
              // DrivingInfoPanel 등에서 posture_time을 쓴다면 light 값으로 동기화
              posture_time: payload.light ?? prev.status.posture_time,
              operating_time: payload.operatingTime ?? prev.status.operating_time,

              // 4. GPS 및 환경
              latitude: payload.latitude ?? prev.status.latitude,
              longitude: payload.longitude ?? prev.status.longitude,
              temperature: payload.temperature ?? prev.status.temperature,
              humidity: payload.humidity ?? prev.status.humidity,
              pressure: payload.pressure ?? prev.status.pressure,

              // 5. 자세/각도
              angle_back: payload.angleBack ?? prev.status.angle_back,
              angle_seat: payload.angleSeat ?? prev.status.angle_seat,
              foot_angle: payload.footAngle ?? prev.status.foot_angle,
              elevation_dist: payload.elevationDist ?? prev.status.elevation_dist,
              slope_fr: payload.slopeFr ?? prev.status.slope_fr,
              slope_side: payload.slopeSide ?? prev.status.slope_side,

              // 6. 메타 데이터
              is_connected: true,
              last_seen: new Date().toISOString(),
            },
          };
        });
      }
    });

    // 실시간 알람 수신
    socket.on('new_alarm', (newAlarm: any) => {
      const currentTargetId = currentIdRef.current;
      if (
        currentTargetId &&
        String(newAlarm.wheelchairId || newAlarm.wheelchair_id) === String(currentTargetId)
      ) {
        const type = (newAlarm.alarmType || newAlarm.alarm_type || '').toUpperCase();

        // E_PCA 감지 시 바로 팝업(POSTURE_ADVICE) 트리거
        if (type === 'POSTURE_ADVICE') {
          setPostureAdviceAt(
            newAlarm.alarmTime ? new Date(newAlarm.alarmTime) : new Date(),
          );
        }

        setDetailData((prev) => (prev ? { ...prev, alarms: [newAlarm, ...prev.alarms] } : null));
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [status]);

  if (status === 'loading' || isLoading) return <LoadingSpinner />;
  if (!detailData) return <div className={styles.loadingContainer}>등록된 휠체어가 없습니다.</div>;

  const isCritical = (alarm: any) => {
    const type = (alarm.alarmType || alarm.type || '').toUpperCase();
    return CRITICAL_KEYWORDS.some((k) => type.includes(k));
  };

  const warningEvents = detailData.alarms.filter(isCritical);
  const infoEvents = detailData.alarms.filter((a) => !isCritical(a));

  return (
    <div className={styles.container}>
      {detailData && (
        <PostureSafetyMonitor
          status={detailData.status}
          wheelchairId={String(detailData.id)}
          postureAdviceAt={postureAdviceAt}
        />
      )}
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
            <div className={`${styles.card} ${styles.eventCard}`}>
              <div className={styles.eventHeader}>
                <h2 className={`${styles.sectionTitle} ${styles.warningTitle}`}>경고 EVENT</h2>
              </div>
              <div className={styles.scrollableContent}>
                <AlertList title="" alarms={warningEvents} />
              </div>
            </div>
            <div className={`${styles.card} ${styles.eventCard}`}>
              <div className={styles.eventHeader}>
                <h2 className={`${styles.sectionTitle} ${styles.infoTitle}`}>알림 EVENT</h2>
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
