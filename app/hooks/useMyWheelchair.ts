// 경로: app/hooks/useMyWheelchair.ts
// 📝 설명: 주행 데이터 + 알람(DB & 실시간 소켓) 통합 관리 훅

import { useState, useEffect, useRef } from 'react';
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

  /** 욕창 예방 완료(서버 ulcer_count 증가) 직전 값 — 증가 시 POSTURE_ADVICE 알람을 자동 확인 처리 */
  const prevUlcerCountRef = useRef<number | null>(null);

  /** 알림 설정의 최신값을 소켓 콜백에서 참조하기 위한 ref */
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // 🔊 Audio 미리 생성 + 무음 unlock
  const audioMapRef = useRef<Record<string, HTMLAudioElement>>({});
  const audioUnlockedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    ['alarm', 'ding', 'chair'].forEach((name) => {
      if (!audioMapRef.current[name]) {
        audioMapRef.current[name] = new Audio(`/sounds/${name}.mp3`);
      }
    });
    const unlock = () => {
      if (audioUnlockedRef.current) return;
      // AudioContext unlock
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch (_) {}
      // Audio 객체도 무음 unlock
      Object.values(audioMapRef.current).forEach((audio) => {
        audio.volume = 0;
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 1.0;
        }).catch(() => { audio.volume = 1.0; });
      });
      audioUnlockedRef.current = true;
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  const triggerMobileAlert = (sound: 'alarm' | 'ding' | 'chair' = 'alarm') => {
    try {
      const audio = audioMapRef.current[sound];
      if (audio) {
        audio.currentTime = 0;
        audio.volume = 1.0;
        audio.play().catch((err) => console.warn('🔊 자동 재생 차단됨:', err));
      }
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(sound === 'ding' ? [300] : [500, 200, 500]);
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
        assign('total_distance', update.total_distance);

        // 2-1) 자세 유지 시간 / 휠체어 사용 시간
        assign('posture_time', update.postureTime ?? update.posture_time);
        assign('operating_time', update.operatingTime ?? update.operating_time);

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

      // 🔇 알림 설정에 따라 소리 재생 여부 결정
      const pushSettings = (dataRef.current?.status as any) || {};
      const isBatteryAlarm = type.includes('LOW_VOLTAGE');
      const isPostureAlarm = type.includes('POSTURE');
      // 배터리·욕창이 아닌 나머지는 긴급 알림으로 분류
      const isEmergencyAlarm = !isBatteryAlarm && !isPostureAlarm;

      const shouldPlaySound =
        DANGER_KEYWORDS.some((k) => type.includes(k)) &&
        !(isBatteryAlarm && pushSettings.push_battery === false) &&
        !(isPostureAlarm && pushSettings.push_posture === false) &&
        !(isEmergencyAlarm && pushSettings.push_emergency === false);

      // 🔔 욕창 예방 완료(COMPLETE) → ding 소리 재생
      const isComplete = type.includes('COMPLETE') || type.includes('SUCCESS');

      if (isComplete) {
        triggerMobileAlert('ding');
      } else if (type.includes('POSTURE_ADVICE')) {
        triggerMobileAlert('chair');
      } else if (shouldPlaySound) {
        triggerMobileAlert('alarm');
      }

      // ⭐️ 최신 알람으로 설정 (팝업용) — 타임스탬프 추가로 같은 알람도 새 객체로 인식
      setLatestAlarm({ ...newAlarm, _receivedAt: Date.now() });
      setTimeout(() => setLatestAlarm(null), 10000);

      // ⭐️ 전체 알람 목록 맨 앞에 추가 (누적 카운트 및 리스트 연동용)
      setAlarms((prev) => [newAlarm, ...prev]);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [session]);

  // POSTURE_COMPLETE에 해당하는 ulcer_count 증가 시, POSTURE_ADVICE는 수동 확인과 동일하게 처리
  useEffect(() => {
    const st = data?.status as { ulcerCount?: number; ulcer_count?: number } | undefined;
    const n = Number(st?.ulcerCount ?? st?.ulcer_count ?? NaN);
    if (!Number.isFinite(n)) return;

    const prev = prevUlcerCountRef.current;
    if (prev === null) {
      prevUlcerCountRef.current = n;
      return;
    }
    if (n <= prev) {
      prevUlcerCountRef.current = n;
      return;
    }

    prevUlcerCountRef.current = n;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/alarms/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolvePostureAdvice: true }),
        });
        if (cancelled || !res.ok) return;
        setAlarms((prevAlarms) =>
          prevAlarms.map((a) => {
            const t = (a.alarmType || a.alarm_type || '').toUpperCase();
            return t === 'POSTURE_ADVICE' && !a.is_resolved ? { ...a, is_resolved: true } : a;
          }),
        );
        setLatestAlarm((la) => {
          const t = (la?.alarmType || la?.alarm_type || '').toUpperCase();
          return t === 'POSTURE_ADVICE' ? null : la;
        });
      } catch (e) {
        console.error('POSTURE_ADVICE 자동 확인 처리 실패:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data?.status]);

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
