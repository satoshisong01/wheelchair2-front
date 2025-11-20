'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import MapView from '@/components/maps/MapView';
import AlertList from '@/components/common/AlertList';
import BatteryStatus from '@/components/common/BatteryStatus';
import styles from './page.module.css';
import { DashboardWheelchair, WheelchairStatus } from '@/types/wheelchair';
import { Alarm } from '@/entities/Alarm';
import EventModal from '@/components/common/EventModal';

// ‼️ [신규] 분리된 컴포넌트 임포트
import { DashboardSummaryCards } from './components/DashboardSummaryCards';
import { WheelchairInfoModal } from './components/WheelchairInfoModal';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

const SOCKET_SERVER_URL = 'https://broker.firstcorea.com:8080';

type RawSocketStatus = Omit<
  Partial<WheelchairStatus>,
  'wheelchairId' | 'lastSeen'
> & {
  wheelchair_id: number;
  last_seen: Date;
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter(); // --- State 정의 ---

  const [selectedWheelchair, setSelectedWheelchair] =
    useState<DashboardWheelchair | null>(null); // ‼️ [핵심] 초기값을 빈 배열로 명확히 지정

  const [wheelchairs, setWheelchairs] = useState<DashboardWheelchair[]>([]);
  const [alarms, setAlarms] = useState<Alarm[]>([]); // ‼️ 모달 상태

  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false); // --- 1. [리디렉션 로직 제거!] --- // 이 로직은 middleware.ts와 충돌하여 무한 핑퐁을 유발합니다. // 이제 middleware.ts가 권한별 이동을 모두 책임집니다.

  useEffect(() => {
    if (status === 'authenticated') {
      console.log(
        `[DASHBOARD-DEBUG] 인증 상태 확인: ${session.user.role}. 클라이언트 리다이렉션 로직 제거됨.`
      );
    }
  }, [status, session]); // --- [2. API로 초기 데이터 로딩] ---

  useEffect(() => {
    // ADMIN 또는 MASTER 권한일 때만 데이터 로딩 시작
    if (
      status === 'authenticated' &&
      (session?.user?.role === 'ADMIN' || session?.user?.role === 'MASTER')
    ) {
      const fetchWheelchairs = async () => {
        try {
          const res = await fetch('/api/wheelchairs');
          if (!res.ok) throw new Error('휠체어 목록 로딩 실패');
          const data = await res.json();
          setWheelchairs(data);
        } catch (error) {
          console.error(error);
        }
      };
      const fetchAlarms = async () => {
        try {
          const res = await fetch('/api/alarms');
          if (!res.ok) throw new Error('알람 목록 로딩 실패');
          const data = await res.json();
          setAlarms(data);
        } catch (error) {
          console.error(error);
        }
      };
      fetchWheelchairs();
      fetchAlarms();
    }
  }, [status, session]); // --- [3. Socket.IO 실시간 연동] ---

  useEffect(() => {
    if (
      status === 'authenticated' &&
      (session?.user?.role === 'ADMIN' || session?.user?.role === 'MASTER')
    ) {
      const socket = io(SOCKET_SERVER_URL);
      socket.on('connect', () => {
        console.log('[Socket.IO] EC2 워커에 연결 성공! (ID:', socket.id, ')');
      });

      socket.on('wheelchair_status_update', (rawPayload: RawSocketStatus) => {
        const { wheelchair_id, last_seen, ...restOfPayload } = rawPayload;
        const formattedStatusUpdate: Partial<WheelchairStatus> = {
          ...restOfPayload,
          wheelchairId: wheelchair_id,
          lastSeen: last_seen,
        };
        setWheelchairs((prevWheelchairs) =>
          prevWheelchairs.map((wheelchair) =>
            wheelchair.id === formattedStatusUpdate.wheelchairId
              ? {
                  ...wheelchair,
                  status: {
                    ...(wheelchair.status || {}),
                    ...formattedStatusUpdate,
                  } as WheelchairStatus,
                }
              : wheelchair
          )
        );
      });

      socket.on('new_alarm', (newAlarmData: Alarm) => {
        console.log('[Socket.IO] ➡️ 실시간 알람 수신:', newAlarmData);
        setAlarms((prevAlarms) => [newAlarmData, ...prevAlarms]);
      });

      socket.on('disconnect', () => {
        console.log('[Socket.IO] 🔌 EC2 워커와 연결 끊김');
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [status, session]); // --- [4. 로딩 UI] --- // 이 로직을 통과하지 못하는 유저(DEVICE_USER, PENDING, UNATUH)는 // middleware.ts가 이미 다른 페이지로 보내주므로, // ADMIN/MASTER가 아닌 경우 로딩 화면을 보여주는 것으로 충분합니다.

  if (
    status === 'loading' ||
    (status === 'authenticated' &&
      session?.user?.role !== 'ADMIN' &&
      session?.user?.role !== 'MASTER')
  ) {
    return <LoadingSpinner />;
  }

  // ‼️ 이 코드가 ADMIN/MASTER가 아닌 모든 유저를 거르는 최종 방어선입니다.
  if (
    status !== 'authenticated' ||
    (session.user.role !== 'ADMIN' && session.user.role !== 'MASTER')
  ) {
    return null;
  } /** 휠체어 선택 시 (맵 이동 + 팝업 열기) */ // --- [핸들러 함수] ---

  const handleWheelchairSelect = (e: any, wheelchair: DashboardWheelchair) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    console.log('휠체어 클릭 이벤트 발생! ID:', wheelchair.id);
    setSelectedWheelchair(wheelchair);
    setIsInfoModalOpen(true);
  }; /** 알람 항목 클릭 시 (팝업 열기) */ // ‼️ [수정] Alarm 타입 호환성 문제 해결 (any 사용)

  const handleAlarmClick = (alarm: any) => {
    const clickedWheelchair = wheelchairs.find(
      (wc) => wc.id === alarm.wheelchairId
    );
    if (clickedWheelchair) {
      setSelectedWheelchair(clickedWheelchair);
      setIsInfoModalOpen(true);
    }
  }; /** '자세히 보기' 버튼 클릭 시 */

  const handleViewDetails = () => {
    if (!selectedWheelchair) return;

    // 1. Modal 닫기
    setIsInfoModalOpen(false);

    // 2. 🚨 [수정] 휠체어 정보 페이지로 이동하며 ID를 쿼리 파라미터로 전달
    router.push(`/wheelchair-info?id=${selectedWheelchair.id}`);
  };

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
            onSelectWheelchair={handleWheelchairSelect}
          />
        </div>
        {/* ‼️ [수정] 모듈화된 컴포넌트 사용 */}
        <DashboardSummaryCards wheelchairs={wheelchairs} />
      </div>
      <div className={styles.bottomRow}>
        <div className={styles.eventSection}>
          <AlertList
            title="경고 EVENT"
            alarms={alarms.filter((a) => a.alarmType === 'FALL')}
            showViewAllButton={true}
            onAlarmClick={handleAlarmClick}
          />
        </div>
        <div className={styles.eventSection}>
          <AlertList
            title="알림 EVENT"
            alarms={alarms.filter((a) => a.alarmType !== 'FALL')}
            showViewAllButton={true}
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
        alarms={alarms.filter((a) => a.alarmType === 'FALL')}
      />
      <EventModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        title="알림 EVENT"
        alarms={alarms.filter((a) => a.alarmType !== 'FALL')}
      />
      {/* ‼️ [수정] 모듈화된 컴포넌트 사용 */}
      <WheelchairInfoModal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        wheelchair={selectedWheelchair}
        onViewDetails={handleViewDetails}
      />
    </div>
  );
}
