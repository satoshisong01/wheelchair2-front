// app/(protected)/wheelchair-info/components/PostureSafetyMonitor.tsx

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface MonitorProps {
  wheelchairId: string;
  // 서버(worker)가 E_PCA 감지 시 내보내는 알람(POSTURE_ADVICE) 발생 시각
  // 이 값이 들어온 순간부터 "장시간 같은 자세" 타이머를 시작합니다.
  postureAdviceAt?: string | Date | null;
  status: {
    current_speed: number;
    last_seen?: string | Date; // 🟢 마지막 통신 시간 필드 추가
    angle_back?: number;
    angle_seat?: number;
    foot_angle?: number;
    elevation_dist?: number;
    slope_fr?: number;
    slope_side?: number;
    [key: string]: unknown;
  } | null;
}

// ⏰ 실제 서비스용: 2시간
const WARNING_DELAY_MS = 2 * 60 * 60 * 1000;
// const WARNING_DELAY_MS = 10 * 1000; // ⚡️ 테스트용

// 🟢 통신 두절 판단 기준 (30초 동안 새 데이터 없으면 멈춘 것으로 간주)
const DISCONNECT_THRESHOLD_MS = 30 * 1000;

export default function PostureSafetyMonitor({
  status,
  wheelchairId,
  postureAdviceAt,
}: MonitorProps) {
  const [showAlarm, setShowAlarm] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // 저장소 키
  const STORAGE_KEY = `posture_last_change_${wheelchairId}`;

  const latestStatusRef = useRef(status);
  const lastChangeTime = useRef<number>(0);
  const prevStatus = useRef<MonitorProps['status']>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isArmed = postureAdviceAt != null;
  const COOLDOWN_MS = 30_000; // 짧은 시간에 POSTURE_ADVICE가 반복될 때 중복 팝업 방지
  const lastShownAtRef = useRef<number>(0);

  const updateLastChangeTime = useCallback(() => {
    const now = Date.now();
    lastChangeTime.current = now;
    localStorage.setItem(STORAGE_KEY, now.toString());
  }, [STORAGE_KEY]);

  const stopAlarm = useCallback(() => {
    setShowAlarm(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    updateLastChangeTime();
  }, [updateLastChangeTime]);

  const triggerAlarm = useCallback(() => {
    setShowAlarm((prev) => {
      if (!prev) {
        console.log('🚨 알람 발동!');
        audioRef.current?.play().catch(() => {});
        return true;
      }
      return prev;
    });
  }, []);

  const stopRequestedRef = useRef(false);
  const requestStopAlarm = useCallback(() => {
    if (stopRequestedRef.current) return;
    stopRequestedRef.current = true;
    setTimeout(() => {
      stopRequestedRef.current = false;
      stopAlarm();
    }, 0);
  }, [stopAlarm]);

  // 1. 오디오 초기화
  useEffect(() => {
    audioRef.current = new Audio('/sounds/alarm.mp3');
    audioRef.current.loop = true;
    audioRef.current.volume = 1.0;
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // 2. 오디오 잠금 해제
  useEffect(() => {
    const unlockAudio = () => {
      if (audioRef.current && !audioUnlocked) {
        audioRef.current
          .play()
          .then(() => {
            audioRef.current?.pause();
            audioRef.current!.currentTime = 0;
            setAudioUnlocked(true);
          })
          .catch(() => {});
      }
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, [audioUnlocked]);

  // 3. 상태 감지 및 시간 저장
  useEffect(() => {
    if (!status) return;
    // POSTURE_ADVICE 알람 모드에서는 자세 변화 감지에 의해 알람을 끄지 않습니다.
    if (postureAdviceAt) return;
    latestStatusRef.current = status;

    if (!prevStatus.current) {
      prevStatus.current = status;

      // E_PCA(POSTURE_ADVICE)가 이미 감지된 상태라면, 타이머 기준을 로컬스토리지 대신 이벤트 시각으로 맞춥니다.
      if (postureAdviceAt) {
        const ts = new Date(postureAdviceAt).getTime();
        if (Number.isFinite(ts)) {
          lastChangeTime.current = ts;
          localStorage.setItem(STORAGE_KEY, ts.toString());
        }
        return;
      }

      const savedTime = localStorage.getItem(STORAGE_KEY);
      if (savedTime) {
        const parsedTime = parseInt(savedTime, 10);
        if (!isNaN(parsedTime) && parsedTime <= Date.now()) {
          lastChangeTime.current = parsedTime;
        } else {
          updateLastChangeTime();
        }
      } else {
        updateLastChangeTime();
      }
      return;
    }

    const postureKeys = [
      'angle_back',
      'angle_seat',
      'foot_angle',
      'elevation_dist',
      'slope_fr',
      'slope_side',
    ];
    const hasChanged = postureKeys.some((key) => {
      const oldVal = Number(prevStatus.current[key]) || 0;
      const newVal = Number(status[key]) || 0;
      return Math.abs(oldVal - newVal) > 0.5;
    });

    if (hasChanged) {
      console.log('🔄 자세 변경됨 -> 타이머 리셋');
      prevStatus.current = status;
      updateLastChangeTime();
      if (showAlarm) requestStopAlarm();
    }
  }, [
    status,
    showAlarm,
    STORAGE_KEY,
    stopAlarm,
    updateLastChangeTime,
    requestStopAlarm,
    postureAdviceAt,
  ]);

  // 3-0. E_PCA(POSTURE_ADVICE) 이벤트가 들어오면 타이머 시작점 갱신
  useEffect(() => {
    if (!postureAdviceAt) return;

    const now = Date.now();
    if (showAlarm) return;
    if (now - lastShownAtRef.current < COOLDOWN_MS) return;

    lastShownAtRef.current = now;
    triggerAlarm();
  }, [postureAdviceAt, showAlarm, triggerAlarm, COOLDOWN_MS]);

  // 4. 타이머 체크: POSTURE_ADVICE 즉시 팝업으로 대체되어 비활성화합니다.

  // --- 알람 제어 ---
  if (!showAlarm) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full border-2 border-red-500 animate-bounce-short">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <span className="text-2xl">🚨</span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">욕창 예방 안내</h3>
          <p className="text-sm text-gray-500 mb-6">
            {!audioUnlocked && (
              <span className="text-red-500 font-bold block mb-1">
                (소리를 들으려면 화면을 클릭하세요)
              </span>
            )}
            욕창 예방을 위해 자세를 조절해주세요!
          </p>
          <button
            onClick={stopAlarm}
            className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700"
          >
            확인했습니다
          </button>
        </div>
      </div>
    </div>
  );
}
