// 경로: app/(protected)/dashboard/page.tsx
// 📝 설명: Alarm 타입의 wheelchairId를 string으로 명시하여 타입 에러 해결 및 소켓 데이터 병합 로직 개선

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import MapView from '@/components/maps/MapView';
import AlertList from '@/components/common/AlertList';
import BatteryStatus from '@/components/common/BatteryStatus';
import styles from './page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair'; // Alarm import 제거 (여기서 재정의)
import EventModal from '../../../components/common/EventModal';
import { DashboardSummaryCards } from './components/DashboardSummaryCards';
import { WheelchairInfoModal } from './components/WheelchairInfoModal';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

const SOCKET_SERVER_URL = 'https://broker.firstcorea.com:8080';

// ⭐️ [수정] Alarm 타입 재정의 (wheelchairId를 string으로 확정)
type Alarm = {
  id: number | string;
  wheelchairId: string; // 🚨 number -> string 변경 (UUID 호환)
  alarmType: string;
  message?: string;
  alarmCondition?: string;
  alarmTime?: Date | string;
  alarmStatus?: string; // AlertList가 허용하도록 추가
  statusId?: number; // AlertList가 허용하도록 추가
  deviceSerial?: string;
  [key: string]: any; // 유연성 확보
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [selectedWheelchair, setSelectedWheelchair] = useState<DashboardWheelchair | null>(null);
  const [wheelchairs, setWheelchairs] = useState<DashboardWheelchair[]>([]);
  const [alarms, setAlarms] = useState<Alarm[]>([]);

  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  // 1. 초기 데이터 로드
  useEffect(() => {
    if (
      status === 'authenticated' &&
      (session?.user?.role === 'ADMIN' || session?.user?.role === 'MASTER')
    ) {
      const fetchWheelchairs = async () => {
        try {
          const res = await fetch(`/api/wheelchairs?t=${Date.now()}`);
          if (res.ok) setWheelchairs(await res.json());
        } catch (e) {
          console.error(e);
        }
      };
      const fetchAlarms = async () => {
        try {
          const res = await fetch('/api/alarms');
          if (res.ok) setAlarms(await res.json());
        } catch (e) {
          console.error(e);
        }
      };
      fetchWheelchairs();
      fetchAlarms();
    }
  }, [status, session]);

  // 2. Socket.IO 연결
  useEffect(() => {
    if (
      status === 'authenticated' &&
      (session?.user?.role === 'ADMIN' || session?.user?.role === 'MASTER')
    ) {
      console.log('🔌 [Dashboard] 소켓 연결 시도:', SOCKET_SERVER_URL);

      const socket = io(SOCKET_SERVER_URL, {
        transports: ['websocket'],
        rejectUnauthorized: false,
        secure: true,
      });

      socket.on('connect', () => {
        console.log('✅ [Dashboard] 소켓 연결 성공!');
      });

      // ⭐️ [수정됨] 들어온 모든 데이터를 병합하여 상태 업데이트
      socket.on('wheelchair_status_update', (payload: any) => {
        setWheelchairs((prevList) =>
          prevList.map((wc) => {
            const wcId = String(wc.id);
            const payloadId = String(payload.wheelchairId || payload.wheelchair_id);

            if (wcId === payloadId) {
              return {
                ...wc,
                status: {
                  ...wc.status, // 1. 기존 상태 유지
                  ...payload, // 2. [수정됨] 들어온 모든 데이터 병합 (각도, 시간 포함)

                  // 3. 필드명 매핑이 필요한 경우에만 아래처럼 명시 (payload 키 이름이 DB 컬럼과 다를 때)
                  current_battery:
                    payload.batteryPercent ?? payload.current_battery ?? wc.status?.current_battery,
                  current_speed: payload.speed ?? payload.current_speed ?? wc.status?.current_speed,
                  current: payload.current ?? wc.status?.current,
                  voltage: payload.voltage ?? wc.status?.voltage,
                  latitude: payload.latitude ?? wc.status?.latitude,
                  longitude: payload.longitude ?? wc.status?.longitude,

                  is_connected: true,
                  last_seen: new Date().toISOString(),
                } as any,
              };
            }
            return wc;
          }),
        );
      });

      socket.on('new_alarm', (newAlarmData: Alarm) => {
        console.log('🚨 [Dashboard] 알람 수신:', newAlarmData);
        setAlarms((prevAlarms) => [newAlarmData, ...prevAlarms]);
      });

      // ⭐️ [핵심 수정] 화살표 함수에 중괄호 {}를 쳐서 return void로 만듦
      return () => {
        socket.disconnect();
      };
    }
  }, [status, session]);

  if (status === 'loading') return <LoadingSpinner />;
  if (
    status !== 'authenticated' ||
    (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'MASTER')
  )
    return null;

  // --- 핸들러 ---
  const handleWheelchairSelect = (e: any, wheelchair: DashboardWheelchair) => {
    if (e?.stopPropagation) e.stopPropagation();
    setSelectedWheelchair(wheelchair);
    setIsInfoModalOpen(true);
  };

  const handleAlarmClick = (alarm: Alarm) => {
    const type = (alarm.alarmType || '').toUpperCase();
    const CRITICAL_KEYWORDS = ['FALL', 'CRITICAL', 'EMERGENCY', 'WARNING'];

    // 알람 ID와 일치하는 휠체어 찾기
    const targetWc = wheelchairs.find((w) => String(w.id) === String(alarm.wheelchairId));
    if (targetWc) setSelectedWheelchair(targetWc);

    if (CRITICAL_KEYWORDS.some((k) => type.includes(k))) {
      setIsWarningModalOpen(true);
    } else {
      setIsAlertModalOpen(true);
    }
  };

  const handleViewDetails = () => {
    if (!selectedWheelchair) return;
    setIsInfoModalOpen(false);
    router.push(`/wheelchair-info?id=${selectedWheelchair.id}`);
  };

  const CRITICAL_KEYWORDS = ['FALL', 'CRITICAL', 'EMERGENCY', 'WARNING', 'FATAL'];

  return (
    <div className={styles.container}>
      <div className={styles.dashboardHeader}>
        <h1 className={styles.headerTitle}>커넥티드 모빌리티</h1>
        <div className={styles.headerCount}>
          <span>{wheelchairs.length}</span> wheelchair
        </div>
      </div>
      <div className={styles.topRow}>
        <div className={styles.mapSection}>
          <MapView
            wheelchairs={wheelchairs}
            selectedWheelchair={selectedWheelchair}
            // 🚨 [FIX] MapView가 인자 1개(wheelchair)만 받으므로,
            // handleWheelchairSelect에 null 이벤트와 휠체어 객체를 전달하도록 감싸줍니다.
            onSelectWheelchair={(wc) => handleWheelchairSelect(null, wc)}
          />
        </div>
        <DashboardSummaryCards wheelchairs={wheelchairs} />
      </div>

      <div className={styles.bottomRow}>
        <div className={styles.eventSection}>
          <AlertList
            title="경고 EVENT"
            alarms={alarms.filter((a) =>
              CRITICAL_KEYWORDS.some((k) => (a.alarmType || '').includes(k)),
            )}
            showViewAllButton={true}
            onViewAllClick={() => setIsWarningModalOpen(true)}
            onAlarmClick={handleAlarmClick}
          />
        </div>
        <div className={styles.eventSection}>
          <AlertList
            title="알림 EVENT"
            alarms={alarms.filter(
              (a) => !CRITICAL_KEYWORDS.some((k) => (a.alarmType || '').includes(k)),
            )}
            showViewAllButton={true}
            onViewAllClick={() => setIsAlertModalOpen(true)}
            onAlarmClick={handleAlarmClick}
          />
        </div>
        <div className={styles.batterySection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>커넥티드 모빌리티 정보</h2>
          </div>
          <div className={styles.scrollableContent}>
            <BatteryStatus
              wheelchairs={wheelchairs}
              selectedWheelchair={selectedWheelchair}
              onSelectWheelchair={handleWheelchairSelect}
            />
          </div>
        </div>
      </div>

      <EventModal
        isOpen={isWarningModalOpen}
        onClose={() => setIsWarningModalOpen(false)}
        title="경고 EVENT"
        alarms={alarms.filter((a) =>
          CRITICAL_KEYWORDS.some((k) => (a.alarmType || '').includes(k)),
        )}
      />
      <EventModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        title="알림 EVENT"
        alarms={alarms.filter(
          (a) => !CRITICAL_KEYWORDS.some((k) => (a.alarmType || '').includes(k)),
        )}
      />
      <WheelchairInfoModal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        wheelchair={selectedWheelchair}
        onViewDetails={handleViewDetails}
      />
    </div>
  );
}
