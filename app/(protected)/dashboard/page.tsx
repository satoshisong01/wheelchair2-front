// 경로: app/(protected)/dashboard/page.tsx
// 📝 설명: 소켓 데이터 병합 + 위험 상황만 소리/진동 알림 (성공은 무음)

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import MapView from '@/components/maps/MapView';
import AlertList from '@/components/common/AlertList';
import BatteryStatus from '@/components/common/BatteryStatus';
import styles from './page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';
import EventModal from '../../../components/common/EventModal';
import { DashboardSummaryCards } from './components/DashboardSummaryCards';
import { WheelchairInfoModal } from './components/WheelchairInfoModal';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

const SOCKET_SERVER_URL = 'https://broker.firstcorea.com:8080';

type Alarm = {
  id: number | string;
  wheelchairId: string;
  alarmType: string;
  message?: string;
  alarmCondition?: string;
  alarmTime?: Date | string;
  alarmStatus?: string;
  statusId?: number;
  deviceSerial?: string;
  [key: string]: any;
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

  // 🔊 [기능 추가] 소리 및 진동 실행 함수
  const triggerAlertSound = () => {
    try {
      const audio = new Audio('/sounds/alarm.mp3');
      audio.play().catch((err) => console.warn('🔊 소리 재생 차단됨:', err));

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([500, 200, 500]); // 징- 징-
      }
    } catch (e) {
      console.error(e);
    }
  };

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

      // 🟢 데이터 병합 로직 (기존 유지)
      socket.on('wheelchair_status_update', (payload: any) => {
        setWheelchairs((prevList) =>
          prevList.map((wc) => {
            const wcId = String(wc.id);
            const payloadId = String(payload.wheelchairId || payload.wheelchair_id);

            if (wcId === payloadId) {
              return {
                ...wc,
                status: {
                  ...wc.status,
                  ...payload,
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

      // 🔴 [핵심 로직] 알람 수신 시 소리 제어 (Whitelist)
      socket.on('new_alarm', (newAlarmData: Alarm) => {
        console.log('🚨 [Dashboard] 알람 수신:', newAlarmData);
        setAlarms((prevAlarms) => [newAlarmData, ...prevAlarms]);

        const type = (newAlarmData.alarmType || '').toUpperCase();

        // 🔊 소리를 울릴 '위험' 키워드 목록
        const SOUND_KEYWORDS = [
          'FALL', // 낙상
          'ROLLOVER', // 전복
          'OBSTACLE', // 장애물
          'SLOPE', // 경사
          'LOW_VOLTAGE', // 저전압
          'POSTURE_ADVICE', // 자세 권고 (이건 알림 필요)
          'WARNING',
          'CRITICAL',
          'EMERGENCY',
        ];

        // 💡 POSTURE_COMPLETE(성공)는 목록에 없으므로 소리가 안 납니다.
        if (SOUND_KEYWORDS.some((k) => type.includes(k))) {
          triggerAlertSound();
        }
      });

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
    const CRITICAL_KEYWORDS = ['FALL', 'CRITICAL', 'EMERGENCY', 'WARNING', 'ROLLOVER'];

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

  const CRITICAL_KEYWORDS = ['FALL', 'CRITICAL', 'EMERGENCY', 'WARNING', 'FATAL', 'ROLLOVER'];

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
