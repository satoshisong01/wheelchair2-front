// 경로: app/(protected)/dashboard/page.tsx
// 📝 설명: USER 권한 추가 + 알람 시 소리/팝업 자동 실행 + 소켓 데이터 병합

'use client';

import { useState, useEffect, useRef } from 'react';
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
import { AlarmCategory, isCriticalAlarmType } from '@/lib/alarm-categories';

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://broker.firstcorea.com';

// 첫 화면 부담을 줄이려 경고·알림은 최신 50건씩만 먼저 받음 (전체 목록은 전체보기 모달을 열 때 조회)
const INLINE_ALARM_LIMIT = 50;

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

// 시간 정보가 없거나 잘못된 알람은 가장 오래된 것으로 정렬
const getAlarmTimeMs = (alarm: Alarm) => new Date(alarm.alarmTime ?? 0).getTime() || 0;

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [selectedWheelchair, setSelectedWheelchair] = useState<DashboardWheelchair | null>(null);
  const [wheelchairs, setWheelchairs] = useState<DashboardWheelchair[]>([]);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  // 전체보기 모달용 분류별 전체 목록 (null이면 아직 조회 전 → 모달에 최근 목록 표시)
  const [fullAlarms, setFullAlarms] = useState<Record<AlarmCategory, Alarm[] | null>>({
    critical: null,
    info: null,
  });
  const fullAlarmsRequestedRef = useRef<Record<AlarmCategory, boolean>>({
    critical: false,
    info: false,
  });
  // 분류별 소켓 알람 수신 횟수 — 전체 목록 조회 중 도착한 알람이 응답에서 빠졌는지 판단용
  const socketAlarmCountRef = useRef<Record<AlarmCategory, number>>({ critical: 0, info: 0 });

  // 소켓 알람 보강용: 최신 wheelchairs 목록을 ref로 유지 (소켓 핸들러 클로저의 stale 방지)
  const wheelchairsRef = useRef<DashboardWheelchair[]>([]);
  useEffect(() => {
    wheelchairsRef.current = wheelchairs;
  }, [wheelchairs]);

  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  // 🔊 소리 및 진동 실행 함수
  const triggerAlertSound = (soundFile: string = 'alarm') => {
    try {
      const audio = new Audio(`/sounds/${soundFile}.mp3`);
      const playPromise = audio.play();

      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('🔊 자동 재생 차단됨 (페이지 클릭 필요):', err);
        });
      }

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([500, 200, 500]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ✅ 권한 체크 함수 (ADMIN, MASTER, USER 모두 허용)
  const isAuthorized = () => {
    const role = session?.user?.role;
    return role === 'ADMIN' || role === 'MASTER' || role === 'USER';
  };

  // 1. 초기 데이터 로드
  useEffect(() => {
    if (status === 'authenticated' && isAuthorized()) {
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
          const [criticalRes, infoRes] = await Promise.all([
            fetch(`/api/alarms?category=critical&limit=${INLINE_ALARM_LIMIT}`),
            fetch(`/api/alarms?category=info&limit=${INLINE_ALARM_LIMIT}`),
          ]);
          if (!criticalRes.ok || !infoRes.ok) return;
          const merged: Alarm[] = [...(await criticalRes.json()), ...(await infoRes.json())];
          setAlarms(merged.sort((a, b) => getAlarmTimeMs(b) - getAlarmTimeMs(a)));
        } catch (e) {
          console.error(e);
        }
      };
      // 세션 갱신(탭 포커스 등)으로 다시 불러올 때는 전체보기 목록도 다음에 열 때 새로 조회
      fullAlarmsRequestedRef.current = { critical: false, info: false };
      fetchWheelchairs();
      fetchAlarms();
    }
  }, [status, session]);

  // 2. Socket.IO 연결
  useEffect(() => {
    if (status === 'authenticated' && isAuthorized()) {
      console.log('🔌 [Dashboard] 소켓 연결 시도:', SOCKET_SERVER_URL);

      const socket = io(SOCKET_SERVER_URL, {
        transports: ['websocket'],
        secure: true,
      });

      socket.on('connect', () => {
        console.log('✅ [Dashboard] 소켓 연결 성공!');

        // 🔐 [보안] 권한 검증 + admin 룸 join 요청
        const userId = (session?.user as any)?.id;
        const role = (session?.user as any)?.role;
        if (userId && role) {
          socket.emit('subscribe', { userId, role });
        }
      });

      // 데이터 병합 로직
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

      // 🔴 알람 수신 시 -> 소리 울리고 + 팝업 띄우기
      socket.on('new_alarm', (newAlarmData: Alarm) => {
        console.log('🚨 [Dashboard] 알람 수신:', newAlarmData);
        // 🔧 소켓 페이로드에는 차량 시리얼이 없고 wheelchairId만 있으므로, 현재 wheelchairs 목록에서
        //    device_serial을 찾아 보강한다. (보강 전엔 차량명이 "-"로 표시되던 문제 해결)
        const matched = wheelchairsRef.current.find(
          (w) => String(w.id) === String(newAlarmData.wheelchairId),
        );
        const serial =
          newAlarmData.deviceSerial || newAlarmData.device_serial || matched?.device_serial;
        const enriched: Alarm = serial
          ? { ...newAlarmData, deviceSerial: serial, wheelchair: { device_serial: serial } }
          : newAlarmData;
        setAlarms((prevAlarms) => [enriched, ...prevAlarms]);

        // 이미 불러온 전체보기 목록에도 추가 (조회 중이면 수신 횟수 비교로 다시 조회됨)
        const category = isCriticalAlarmType(enriched.alarmType) ? 'critical' : 'info';
        const counts = socketAlarmCountRef.current;
        socketAlarmCountRef.current = { ...counts, [category]: counts[category] + 1 };
        setFullAlarms((prev) => {
          const list = prev[category];
          return list ? { ...prev, [category]: [enriched, ...list] } : prev;
        });

        const type = (newAlarmData.alarmType || '').toUpperCase();

        const CRITICAL_KEYWORDS = ['FALL', 'ROLLOVER', 'CRITICAL', 'EMERGENCY', 'WARNING'];
        const ALERT_KEYWORDS = ['OBSTACLE', 'SLOPE', 'LOW_VOLTAGE', 'POSTURE_ADVICE'];

        // 🔊 소리 재생 (성공 메시지는 제외됨)
        const SOUND_KEYWORDS = [...CRITICAL_KEYWORDS, ...ALERT_KEYWORDS];
        if (type.includes('POSTURE_ADVICE')) {
          triggerAlertSound('chair');
        } else if (SOUND_KEYWORDS.some((k) => type.includes(k))) {
          triggerAlertSound();
        }

        // 🚨 팝업 자동 열기
        if (CRITICAL_KEYWORDS.some((k) => type.includes(k))) {
          setIsWarningModalOpen(true);
        } else if (ALERT_KEYWORDS.some((k) => type.includes(k))) {
          setIsAlertModalOpen(true);
        }
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [status, session]);

  // 3. 전체보기 모달을 처음 열 때 해당 분류의 전체 목록 조회
  useEffect(() => {
    const loadFullAlarms = async (category: AlarmCategory, attempt = 0): Promise<void> => {
      fullAlarmsRequestedRef.current = { ...fullAlarmsRequestedRef.current, [category]: true };
      const countAtStart = socketAlarmCountRef.current[category];
      try {
        const res = await fetch(`/api/alarms?category=${category}`);
        if (!res.ok) throw new Error(`전체 알람 조회 실패 (${res.status})`);
        const rows: Alarm[] = await res.json();
        // 조회 중 같은 분류 소켓 알람이 왔으면 응답에 빠졌을 수 있어 다시 조회 (기기 오작동으로 알람이 쏟아져도 무한 반복하지 않게 2회까지)
        if (socketAlarmCountRef.current[category] !== countAtStart && attempt < 2) {
          return loadFullAlarms(category, attempt + 1);
        }
        setFullAlarms((prev) => ({ ...prev, [category]: rows }));
      } catch (e) {
        fullAlarmsRequestedRef.current = { ...fullAlarmsRequestedRef.current, [category]: false };
        console.error(e);
      }
    };
    if (isWarningModalOpen && !fullAlarmsRequestedRef.current.critical) loadFullAlarms('critical');
    if (isAlertModalOpen && !fullAlarmsRequestedRef.current.info) loadFullAlarms('info');
  }, [isWarningModalOpen, isAlertModalOpen]);

  // 세션 확인 중(loading)에도 빈 데이터로 같은 화면을 그림 — 지도 영역이 정적 HTML에 실려 첫 페인트에 그려지고(LCP),
  //   인증 후에도 트리가 같아 MapView가 다시 마운트되지 않음 (데이터 조회·소켓은 위 effect에서 인증·권한 확인 후에만)
  // ⛔ 권한 없음 처리 (USER도 통과하도록 수정됨)
  if (status === 'unauthenticated' || (status === 'authenticated' && !isAuthorized())) {
    return null; // 또는 <div>접근 권한이 없습니다.</div>
  }

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

  const criticalAlarms = alarms.filter((a) => isCriticalAlarmType(a.alarmType));
  const infoAlarms = alarms.filter((a) => !isCriticalAlarmType(a.alarmType));

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
        <DashboardSummaryCards
            wheelchairs={wheelchairs}
            onSelectWheelchair={(wc) => router.push(`/wheelchair-info?id=${wc.id}`)}
          />
      </div>

      <div className={styles.bottomRow}>
        <div className={styles.eventSection}>
          <AlertList
            title="경고 EVENT"
            alarms={criticalAlarms}
            showViewAllButton={true}
            onViewAllClick={() => setIsWarningModalOpen(true)}
            onAlarmClick={handleAlarmClick}
          />
        </div>
        <div className={styles.eventSection}>
          <AlertList
            title="알림 EVENT"
            alarms={infoAlarms}
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
        alarms={fullAlarms.critical ?? criticalAlarms}
      />
      <EventModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        title="알림 EVENT"
        alarms={fullAlarms.info ?? infoAlarms}
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
