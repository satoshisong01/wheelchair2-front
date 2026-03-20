// 경로: app/hooks/useMyWheelchair.ts
// 📝 설명: 주행 데이터 + 알람(DB & 실시간 소켓) 통합 관리 훅

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { DashboardWheelchair } from '@/types/wheelchair';

// 🟢 도메인 주소 사용 (SSL 적용)
const SOCKET_URL = 'https://broker.firstcorea.com:8080';

// 알람 인터페이스 정의 (DB의 snake_case와 소켓의 camelCase 모두 대응)
export interface Alarm {
  id?: string | number;
  alarmType?: string;
  alarm_type?: string;
  message?: string;
  alarmCondition?: string;
  alarm_condition?: string;
  alarmTime?: string | Date;
  alarm_time?: string | Date;
  [key: string]: any;
}

export function useMyWheelchair() {
  const { data: session } = useSession();

  const [data, setData] = useState<DashboardWheelchair | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);

  // 🚨 [핵심] 실시간으로 발생한 최신 알람 (팝업용)
  const [latestAlarm, setLatestAlarm] = useState<Alarm | null>(null);

  // 🚨 [핵심] 알람 목록 (DB 데이터 + 실시간 누적)
  const [alarms, setAlarms] = useState<Alarm[]>([]);

  // 🔊 소리 및 진동 실행 함수
  const triggerMobileAlert = () => {
    try {
      const audio = new Audio('/sounds/alarm.mp3');
      audio.play().catch((err) => console.warn('🔊 자동 재생 차단됨:', err));
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([500, 200, 500]);
      }
    } catch (e) {
      console.error('알림 효과 오류:', e);
    }
  };

  useEffect(() => {
    if (!session) return;

    // 1. 초기 데이터 가져오기 (DB 데이터 로드)
    const fetchData = async () => {
      try {
        const res = await fetch('/api/device-info');
        if (res.ok) {
          const json = await res.json();

          // 휠체어 기본 정보 및 상태 저장
          setData({
            ...json,
            status: json.status || {},
          } as DashboardWheelchair);

          // 🚨 DB에 저장되어 있던 기존 알람 목록 저장
          if (json.alarms && Array.isArray(json.alarms)) {
            setAlarms(json.alarms);
          }
        }
      } catch (error) {
        console.error('Failed to fetch wheelchair data', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // 2. 소켓 연결 설정
    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket'],
      secure: true,
      rejectUnauthorized: false,
      reconnection: true,
    });

    socketInstance.on('connect', () => {
      console.log('✅ [Mobile Hook] 소켓 연결 성공!');
    });

    const myWheelchairId = (session.user as any)?.wheelchairId;

    // 3. 실시간 주행 상태 데이터 업데이트
    socketInstance.on('wheelchair_status_update', (update: any) => {
      // 내 휠체어가 아닌 업데이트는 무시
      if (
        myWheelchairId &&
        String(update.wheelchairId || update.wheelchair_id) !== String(myWheelchairId)
      ) {
        return;
      }

      // 🟢 camelCase로 온 경사/각도 필드를 snake_case와 함께 매핑
      setData((prev) => {
        if (!prev) return prev;

        const prevStatus = prev.status || {};
        const nextStatus: any = { ...prevStatus };

        const assign = (key: string, value: any) => {
          if (value !== null && value !== undefined) {
            nextStatus[key] = value;
          }
        };

        // 1) 배터리 / 속도 / 전압 / 전류
        assign('current_battery', update.batteryPercent ?? update.current_battery);
        assign('current_speed', update.speed ?? update.current_speed);
        assign('voltage', update.voltage);
        assign('current', update.current);

        // 2) 주행 데이터
        assign('runtime', update.runtime);
        assign('distance', update.distance);

        // 2-0) 욕창 예방 카운트 (POSTURE_COMPLETE에서 증가)
        assign('ulcer_count', update.ulcerCount ?? update.ulcer_count);
        assign('ulcerCount', update.ulcerCount ?? update.ulcer_count);

        // 3) 자세/각도
        assign('angle_back', update.angleBack ?? update.angle_back);
        assign('angle_seat', update.angleSeat ?? update.angle_seat);
        assign('foot_angle', update.footAngle ?? update.foot_angle);
        assign('elevation_dist', update.elevationDist ?? update.elevation_dist);
        assign('slope_fr', update.slopeFr ?? update.slope_fr);
        assign('slope_side', update.slopeSide ?? update.slope_side);

        // 4) 환경 / GPS
        assign('latitude', update.latitude);
        assign('longitude', update.longitude);
        assign('temperature', update.temperature);
        assign('humidity', update.humidity);
        assign('pressure', update.pressure);

        // 5) 메타
        nextStatus.is_connected = true;
        nextStatus.last_seen = new Date().toISOString();

        return {
          ...prev,
          status: nextStatus,
        } as DashboardWheelchair;
      });
    });

    // 4. 🚨 실시간 알람 수신 및 목록 누적
    socketInstance.on('new_alarm', (newAlarm: Alarm) => {
      console.log('🚨 [Mobile Hook] 새 알람 수신:', newAlarm);

      const type = (newAlarm.alarmType || newAlarm.alarm_type || '').toUpperCase();

      // 소리를 울릴 위험 키워드 (성공 신호인 COMPLETE 제외)
      const DANGER_KEYWORDS = [
        'FALL',
        'ROLLOVER',
        'OBSTACLE',
        'SLOPE',
        'LOW_VOLTAGE',
        'POSTURE_ADVICE',
      ];

      if (DANGER_KEYWORDS.some((k) => type.includes(k))) {
        triggerMobileAlert();
      }

      // ⭐️ 최신 알람으로 설정 (팝업용)
      setLatestAlarm(newAlarm);

      // ⭐️ 전체 알람 목록 맨 앞에 추가 (누적 카운트 및 리스트 연동용)
      setAlarms((prev) => [newAlarm, ...prev]);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [session]);

  return {
    data,
    loading,
    socket,
    latestAlarm,
    setLatestAlarm,
    alarms, // 👈 이제 이 배열을 화면에서 사용하면 됩니다.
    setAlarms,
  };
}
