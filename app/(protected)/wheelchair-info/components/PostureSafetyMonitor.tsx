// app/(protected)/wheelchair-info/components/PostureSafetyMonitor.tsx

'use client';

import { useState, useEffect, useRef } from 'react';

interface MonitorProps {
  wheelchairId: string; // 🟢 ID Prop 추가
  status: {
    current_speed: number;
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
const WARNING_DELAY_MS = 2 * 60 * 60 * 1000;
// const WARNING_DELAY_MS = 10 * 1000;

export default function PostureSafetyMonitor({ status, wheelchairId }: MonitorProps) {
  const [showAlarm, setShowAlarm] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // 저장소 키 생성 (기기별로 따로 시간 관리)
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

  // 2. 오디오 잠금 해제 (클릭 시)
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

  // 3. 상태 감지 및 시간 저장 로직 (핵심!)
  useEffect(() => {
    if (!status) return;
    latestStatusRef.current = status;

    // (1) 처음 데이터가 들어왔을 때
    if (!prevStatus.current) {
      prevStatus.current = status;

      // ⭐️ 핵심: 브라우저 저장소(localStorage)에서 마지막 변경 시간을 불러옵니다.
      const savedTime = localStorage.getItem(STORAGE_KEY);
      if (savedTime) {
        // 저장된 시간이 있으면 그걸 사용 (새로고침 해도 유지됨!)
        const parsedTime = parseInt(savedTime, 10);
        // 단, 미래의 시간이거나 너무 이상한 값이면 현재 시간으로 초기화
        if (!isNaN(parsedTime) && parsedTime <= Date.now()) {
          lastChangeTime.current = parsedTime;
          console.log(`💾 복원된 시간: ${new Date(parsedTime).toLocaleTimeString()}`);
        } else {
          updateLastChangeTime();
        }
      } else {
        // 저장된 게 없으면 현재 시간으로 시작
        updateLastChangeTime();
      }
      return;
    }

    // (2) 자세 변경 감지
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
      console.log('🔄 자세 변경됨 -> 타이머 리셋 및 저장');
      prevStatus.current = status;
      updateLastChangeTime(); // 시간 갱신 및 저장
      if (showAlarm) stopAlarm();
    }
  }, [status, showAlarm, STORAGE_KEY]);

  // 🛠 시간 업데이트 및 localStorage 저장 헬퍼 함수
  const updateLastChangeTime = () => {
    const now = Date.now();
    lastChangeTime.current = now;
    localStorage.setItem(STORAGE_KEY, now.toString());
  };

  // 4. 타이머 체크
  useEffect(() => {
    const timer = setInterval(() => {
      const currentStatus = latestStatusRef.current;
      if (!currentStatus) return;

      const isDriving = (currentStatus.current_speed || 0) > 0;

      if (isDriving) {
        const elapsed = Date.now() - lastChangeTime.current;
        // console.log(`⏱️ 경과: ${(elapsed/1000).toFixed(1)}초`); // 로그가 너무 많으면 주석 처리

        if (elapsed > WARNING_DELAY_MS) {
          triggerAlarm();
        }
      } else {
        // 운행을 멈추면 시간을 현재로 계속 리셋 (운행 중일 때만 카운트하므로)
        // 멈춘 상태에서도 타이머를 초기화하여 저장소도 갱신
        updateLastChangeTime();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [STORAGE_KEY]); // 키가 바뀌면 타이머 재설정

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
    updateLastChangeTime(); // 알람 끄면 시간 초기화
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
