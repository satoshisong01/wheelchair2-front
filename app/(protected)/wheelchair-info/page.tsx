'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { io } from 'socket.io-client';
import { useSearchParams } from 'next/navigation';
// 🚨 로컬 컴포넌트 경로 확인 (본인 프로젝트 경로에 맞게 수정 필요할 수 있음)
import MapView from '@/components/maps/MapView';
import AlertList from '@/components/common/AlertList';
import styles from './page.module.css';
import { DashboardWheelchair } from '@/types/wheelchair';
import { Alarm } from '@/entities/Alarm';
import { MaintenanceLog } from '@/entities/MaintenanceLog';

import { InfoBar } from './components/InfoBar';
import { DrivingInfoPanel } from './components/DrivingInfoPanel';
import { WheelchairStatePanel } from './components/WheelchairStatePanel';
import { PostureControlPanel } from './components/PostureControlPanel';
import { TopRightPanel } from './components/TopRightPanel';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

const SOCKET_SERVER_URL = 'https://broker.firstcorea.com:8080';

// 🚨 [안전장치] DB에 severity 값이 없거나 비어있을 경우를 대비한 키워드 목록
const CRITICAL_KEYWORDS = [
  'FALL', // 낙상
  'CRITICAL',
  'EMERGENCY',
  'WARNING',
  'FATAL',
  'COLLISION', // 충돌
  'TIPPING', // 전복
  'ACCIDENT',
];

type WheelchairDetailData = DashboardWheelchair & {
  alarms: Alarm[];
  maintenanceLogs: MaintenanceLog[];
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

  const userRole = (session?.user?.role as string) || '';
  const isManager = userRole === 'ADMIN' || userRole === 'MASTER';
  const isDeviceUser = userRole === 'DEVICE' || userRole === 'DEVICE_USER';

  // 1. 초기 데이터 로딩
  useEffect(() => {
    if (status !== 'authenticated') return;

    const urlWheelchairId = searchParams.get('id');

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 1-1. 휠체어 목록 가져오기
        const listRes = await fetch('/api/wheelchairs');
        if (!listRes.ok) throw new Error('목록을 불러올 수 없습니다.');
        const list: DashboardWheelchair[] = await listRes.json();

        setAllWheelchairs(list);

        // 1-2. 보여줄 대상 ID 선정
        let targetId: number | null = null;

        if (isManager) {
          if (urlWheelchairId && !isNaN(Number(urlWheelchairId))) {
            targetId = Number(urlWheelchairId);
          } else if (list.length > 0) {
            targetId = list[0].id;
          }
        } else if (isDeviceUser) {
          // 기기 사용자는 첫 번째가 본인
          if (list.length > 0) {
            targetId = list[0].id;
          }
        }

        // 1-3. 상세 데이터 구성 (알람 포함)
        if (targetId !== null) {
          const selectedWc = list.find((wc) => wc.id === targetId);

          if (selectedWc) {
            let fetchedAlarms: Alarm[] = [];
            try {
              // const alarmRes = await fetch('/api/alarms');
              const alarmRes = await fetch(
                `/api/alarms?wheelchairId=${targetId}`
              );
              if (alarmRes.ok) {
                const allAlarmsData = await alarmRes.json();
                // 해당 휠체어의 알람만 필터링
                fetchedAlarms = Array.isArray(allAlarmsData)
                  ? allAlarmsData.filter(
                      (a: any) =>
                        Number(a.wheelchairId || a.wheelchair_id) ===
                        Number(targetId)
                    )
                  : [];
              }
            } catch (err) {
              console.error('알람 데이터 로딩 오류:', err);
            }

            setDetailData({
              ...selectedWc,
              alarms: fetchedAlarms,
              maintenanceLogs: [],
            } as WheelchairDetailData);
          }
        }
      } catch (error) {
        console.error('데이터 로딩 실패:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [status, isDeviceUser, isManager, searchParams]);

  // 2. 휠체어 변경 핸들러 (상단 드롭다운 선택 시)
  const handleSelectWheelchair = async (id: number) => {
    const selected = allWheelchairs.find((wc) => wc.id === id);
    if (selected) {
      // 휠체어 변경 시 알람 데이터도 새로 갱신 (간단 구현)
      let newAlarms: Alarm[] = [];
      try {
        const res = await fetch(`/api/alarms?wheelchairId=${id}`);
        if (res.ok) {
          const data = await res.json();
          newAlarms = Array.isArray(data)
            ? data.filter(
                (a: any) => Number(a.wheelchairId || a.wheelchair_id) === id
              )
            : [];
        }
      } catch (e) {
        console.error(e);
      }

      setDetailData({
        ...selected,
        alarms: newAlarms,
        maintenanceLogs: [],
      } as WheelchairDetailData);
    }
  };

  // 3. Socket.IO (실시간 업데이트)
  useEffect(() => {
    if (status !== 'authenticated') return;
    const socket = io(SOCKET_SERVER_URL);

    // (1) 휠체어 상태(배터리, 속도 등) 업데이트
    socket.on('wheelchair_status_update', (newStatus: any) => {
      if (isManager) {
        setAllWheelchairs((prev) =>
          prev.map((wc) =>
            wc.id === newStatus.wheelchair_id
              ? { ...wc, status: { ...wc.status, ...newStatus } }
              : wc
          )
        );
      }
      if (detailData && detailData.id === newStatus.wheelchair_id) {
        setDetailData((prev) =>
          prev
            ? ({
                ...prev,
                status: { ...prev.status, ...newStatus },
              } as WheelchairDetailData)
            : null
        );
      }
    });

    // (2) 실시간 알람 수신
    socket.on('new_alarm', (newAlarm: any) => {
      // 현재 보고 있는 휠체어의 알람이면 추가
      if (
        detailData &&
        Number(newAlarm.wheelchairId || newAlarm.wheelchair_id) ===
          detailData.id
      ) {
        setDetailData((prev) =>
          prev
            ? {
                ...prev,
                alarms: [newAlarm, ...prev.alarms],
              }
            : null
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [status, isManager, detailData?.id]);

  if (status === 'loading' || isLoading) {
    return <LoadingSpinner />;
  }

  if (!detailData) {
    return (
      <div className={styles.loadingContainer}>
        <h1>등록된 휠체어가 없습니다.</h1>
        {isManager && <p>기기 관리 메뉴에서 휠체어를 등록해주세요.</p>}
        {isDeviceUser && <p>관리자에게 기기 등록(연동)을 요청해주세요.</p>}
      </div>
    );
  }

  // 🚨 [핵심 로직] 경고/알림 분류 (DB 컬럼 우선 -> 키워드 백업)
  const allAlarms = detailData.alarms || [];

  const isCritical = (alarm: any) => {
    // [디버깅] 실제 들어오는 데이터가 뭔지 콘솔에서 확인 (F12 -> Console)
    // 확인 후에는 삭제하셔도 됩니다.
    // console.log('알람 데이터 확인:', alarm);

    // 1단계: DB의 severity 컬럼 확인 (API가 값을 줄 경우 최우선)
    if (alarm.severity === 'WARNING' || alarm.severity === 'CRITICAL') {
      return true;
    }

    // 2단계: 영어 타입명(Key) 확인 (대소문자, 변수명 변형 모두 대응)
    // alarm_type, type, alarmType 중 하나라도 값을 가지면 가져옴
    const typeRaw = alarm.alarm_type || alarm.type || alarm.alarmType || '';
    const type = typeRaw.toString().toUpperCase();

    if (CRITICAL_KEYWORDS.includes(type)) {
      return true;
    }

    // 3단계: [최후의 수단] 한글 메시지 내용 확인
    // 화면에 '낙상'이라고 뜨고 있다면, message나 description 필드에 그 글자가 있다는 뜻입니다.
    const message = (
      alarm.message ||
      alarm.description ||
      alarm.content ||
      ''
    ).toString();

    // 메시지에 위험한 단어가 포함되어 있으면 경고로 분류
    if (
      message.includes('낙상') ||
      message.includes('충돌') ||
      message.includes('전복') ||
      message.includes('사고')
    ) {
      return true;
    }

    return false;
  };

  const warningEvents = allAlarms.filter((alarm) => isCritical(alarm));
  const infoEvents = allAlarms.filter((alarm) => !isCritical(alarm));

  return (
    <div className={styles.container}>
      <InfoBar
        wc={detailData}
        allWheelchairs={allWheelchairs}
        onSelectWheelchair={handleSelectWheelchair}
        disableDropdown={!isManager}
      />

      <div className={styles.mainContent}>
        {/* 좌측 컬럼 */}
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

        {/* 우측 컬럼 */}
        <div className={styles.rightColumn}>
          <div className={styles.rightTop}>
            <TopRightPanel wc={detailData} />
            <PostureControlPanel wc={detailData} />
          </div>

          {/* 이벤트 영역 */}
          <div className={styles.eventArea}>
            {/* 1. 경고 EVENT 패널 */}
            <div className={`${styles.card} ${styles.eventCard}`}>
              <div className={styles.eventHeader}>
                <h2 className={`${styles.sectionTitle} ${styles.warningTitle}`}>
                  경고 EVENT
                </h2>
                <span className={styles.viewAllLink}>전체보기 &gt;</span>
              </div>
              <div className={styles.scrollableContent}>
                <AlertList title="" alarms={warningEvents} />
                {warningEvents.length === 0 && (
                  <div className={styles.emptyMessage}>
                    경고 알람이 없습니다
                  </div>
                )}
              </div>
            </div>

            {/* 2. 알림 EVENT 패널 */}
            <div className={`${styles.card} ${styles.eventCard}`}>
              <div className={styles.eventHeader}>
                <h2 className={`${styles.sectionTitle} ${styles.infoTitle}`}>
                  알림 EVENT
                </h2>
                <span className={styles.viewAllLink}>전체보기 &gt;</span>
              </div>
              <div className={styles.scrollableContent}>
                <AlertList title="" alarms={infoEvents} />
                {infoEvents.length === 0 && (
                  <div className={styles.emptyMessage}>알람이 없습니다</div>
                )}
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
    <Suspense
      fallback={<div className={styles.loadingContainer}>로딩 중...</div>}
    >
      <WheelchairInfoContent />
    </Suspense>
  );
}
