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

// 타입 정의 (기존 유지)
type WheelchairDetailData = DashboardWheelchair & {
  alarms: Alarm[];
  maintenanceLogs: any[];
  status: {
    // ... (기존 status 필드들 유지)
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
    is_connected: boolean;
    last_seen?: string;
    posture_time?: number;
    operating_time?: number;
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
          currentIdRef.current = String(targetId); // 문자열로 통일
          const selectedWc = list.find(
            (wc: any) => String(wc.id) === String(targetId)
          ) as WheelchairDetailData;

          if (selectedWc) {
            let fetchedAlarms: any[] = [];
            try {
              // 3. 알람 가져오기 (API 호출)
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

                // ⭐️ [핵심 수정] 알람 필터링 로직 강화
                // API가 'wheelchairId' (camelCase)로 보내주는지, 'wheelchair_id'로 보내주는지 모두 체크
                // 그리고 targetId와 문자열(String)로 비교
                fetchedAlarms = allAlarms.filter(
                  (a: any) =>
                    String(a.wheelchairId || a.wheelchair_id) ===
                    String(targetId)
                );
              }
            } catch (e) {
              console.error('알람 로딩 실패', e);
            }

            setDetailData({
              ...selectedWc,
              alarms: fetchedAlarms, // 필터링된 알람 넣기
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

      // ⭐️ 알람 다시 가져오기 (선택 변경 시 최신 알람 반영)
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
            (a: any) => String(a.wheelchairId || a.wheelchair_id) === String(id)
          );
        }
      } catch (e) {}

      setDetailData({
        ...selected,
        alarms: fetchedAlarms, // ⭐️ 업데이트된 알람 설정
        maintenanceLogs: [],
      } as WheelchairDetailData);
    }
  };

  // 3. 소켓 연결
  useEffect(() => {
    if (socketRef.current || status !== 'authenticated') return;

    const socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket'],
      rejectUnauthorized: false,
      secure: true,
    });

    socketRef.current = socket;

    // 상태 업데이트 수신
    socket.on('wheelchair_status_update', (payload: any) => {
      const currentTargetId = currentIdRef.current;
      // ID 비교 (문자열 변환 후 비교)
      if (
        currentTargetId &&
        String(payload.wheelchairId || payload.wheelchair_id) ===
          String(currentTargetId)
      ) {
        setDetailData((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: {
              ...prev.status,
              // ... (기존 매핑 로직 유지)
              current_battery:
                payload.batteryPercent ?? prev.status.current_battery,
              current_speed: payload.speed ?? prev.status.current_speed,
              voltage: payload.voltage ?? prev.status.voltage,
              current: payload.current ?? prev.status.current,
              angle_back: payload.angleBack ?? prev.status.angle_back,
              angle_seat: payload.angleSeat ?? prev.status.angle_seat,
              foot_angle: payload.footAngle ?? prev.status.foot_angle,
              elevation_dist:
                payload.elevationDist ?? prev.status.elevation_dist,
              slope_fr: payload.slopeFr ?? prev.status.slope_fr,
              slope_side: payload.slopeSide ?? prev.status.slope_side,
              latitude: payload.latitude ?? prev.status.latitude,
              longitude: payload.longitude ?? prev.status.longitude,
              temperature: payload.temperature ?? prev.status.temperature,
              humidity: payload.humidity ?? prev.status.humidity,
              pressure: payload.pressure ?? prev.status.pressure,
              posture_time: payload.postureTime ?? prev.status.posture_time,
              operating_time:
                payload.operatingTime ?? prev.status.operating_time,
              is_connected: true,
              last_seen: new Date().toISOString(),
            },
          };
        });
      }
    });

    // ⭐️ [신규 알람] 실시간 수신 처리
    socket.on('new_alarm', (newAlarm: any) => {
      const currentTargetId = currentIdRef.current;
      // 현재 보고 있는 휠체어의 알람이면 리스트에 추가
      if (
        currentTargetId &&
        String(newAlarm.wheelchairId || newAlarm.wheelchair_id) ===
          String(currentTargetId)
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

  if (status === 'loading' || isLoading) return <LoadingSpinner />;
  if (!detailData)
    return (
      <div className={styles.loadingContainer}>등록된 휠체어가 없습니다.</div>
    );

  // ⭐️ [필터링] 알람 타입 체크 (대소문자 무시 등 안전하게)
  const isCritical = (alarm: any) => {
    const type = (alarm.alarmType || alarm.type || '').toUpperCase();
    return CRITICAL_KEYWORDS.some((k) => type.includes(k));
  };

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
        {/* ... (이하 JSX 레이아웃은 기존과 100% 동일) ... */}
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
                <h2 className={`${styles.sectionTitle} ${styles.warningTitle}`}>
                  경고 EVENT
                </h2>
              </div>
              <div className={styles.scrollableContent}>
                {/* ⭐️ 필터링된 경고 목록 전달 */}
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
                {/* ⭐️ 필터링된 알림 목록 전달 */}
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
