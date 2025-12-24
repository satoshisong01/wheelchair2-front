// app/(protected)/wheelchair-info/components/PostureSafetyMonitor.tsx

'use client';

import { useState, useEffect, useRef } from 'react';

interface MonitorProps {
  wheelchairId: string;
  status: {
    current_speed: number;
    last_seen?: string | Date; // 🟢 마지막 통신 시간 필드 추가
    angle_back?: number;
    angle_seat?: number;
    foot_angle?: number;
    elevation_dist?: number;
    slope_fr?: number;
    slope_side?: number;
    [key: string]: any;
  } | null;
}

// ⏰ 실제 서비스용: 2시간
// const WARNING_DELAY_MS = 2 * 60 * 60 * 1000;
const WARNING_DELAY_MS = 10 * 1000; // ⚡️ 테스트용

// 🟢 통신 두절 판단 기준 (30초 동안 새 데이터 없으면 멈춘 것으로 간주)
const DISCONNECT_THRESHOLD_MS = 30 * 1000;

export default function PostureSafetyMonitor({ status, wheelchairId }: MonitorProps) {
  const [showAlarm, setShowAlarm] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // 저장소 키
  const STORAGE_KEY = `posture_last_change_${wheelchairId}`;

  const latestStatusRef = useRef(status);
  const lastChangeTime = useRef<number>(Date.now());
  const prevStatus = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    latestStatusRef.current = status;

    if (!prevStatus.current) {
      prevStatus.current = status;
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
      if (showAlarm) stopAlarm();
    }
  }, [status, showAlarm, STORAGE_KEY]);

  const updateLastChangeTime = () => {
    const now = Date.now();
    lastChangeTime.current = now;
    localStorage.setItem(STORAGE_KEY, now.toString());
  };

  // 4. 타이머 체크 (핵심 수정 부분)
  useEffect(() => {
    const timer = setInterval(() => {
      const currentStatus = latestStatusRef.current;
      if (!currentStatus) return;

      const now = Date.now();

      // 🟢 (1) 데이터 신선도 체크
      // last_seen이 없거나, 현재 시간과 차이가 30초 이상 나면 '오래된 데이터'
      let isDataFresh = true;
      if (currentStatus.last_seen) {
        const lastSeenTime = new Date(currentStatus.last_seen).getTime();
        if (now - lastSeenTime > DISCONNECT_THRESHOLD_MS) {
          isDataFresh = false;
        }
      }

      // 🟢 (2) 운행 중 판단: "속도 > 0" AND "데이터가 신선함"
      const isSpeeding = (currentStatus.current_speed || 0) > 0;
      const isDriving = isSpeeding && isDataFresh;

      if (isDriving) {
        const elapsed = now - lastChangeTime.current;
        if (elapsed > WARNING_DELAY_MS) {
          triggerAlarm();
        }
      } else {
        // 운행 중이 아니거나 통신이 끊기면 -> 타이머 계속 리셋 (알람 방지)

        // 디버깅용 로그 (테스트 할 때만 주석 해제)
        // if (!isDataFresh && isSpeeding) console.log("⚠️ 통신 끊김: 속도는 있지만 데이터가 오래됨");

        updateLastChangeTime();
        if (showAlarm) stopAlarm(); // 혹시 켜져있으면 끔
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [STORAGE_KEY, showAlarm]);

  // --- 알람 제어 ---
  const triggerAlarm = () => {
    setShowAlarm((prev) => {
      if (!prev) {
        console.log('🚨 알람 발동!');
        audioRef.current?.play().catch(() => {});
        return true;
      }
      return prev;
    });
  };

  const stopAlarm = () => {
    setShowAlarm(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    updateLastChangeTime();
  };

  if (!showAlarm) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full border-2 border-red-500 animate-bounce-short">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <span className="text-2xl">🚨</span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">장시간 같은 자세 경고</h3>
          <p className="text-sm text-gray-500 mb-6">
            {!audioUnlocked && (
              <span className="text-red-500 font-bold block mb-1">
                (소리를 들으려면 화면을 클릭하세요)
              </span>
            )}
            운행 중 2시간 동안 자세 변경이 감지되지 않았습니다.
            <br />
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
