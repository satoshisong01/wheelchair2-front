'use client';

import { useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { ko } from 'date-fns/locale/ko';
import EventModal from './EventModal';

import styles from './AlertList.module.css';
import { Alarm } from '@/entities/Alarm';
import { Wheelchair } from '@/entities/Wheelchair';

type AlarmWithWheelchair = Alarm & {
  wheelchair?: Partial<Wheelchair>;
};

// ‼️ [수정 1] Props 인터페이스에 onAlarmClick 추가
interface AlertListProps {
  alarms: AlarmWithWheelchair[];
  title: string;
  showViewAllButton?: boolean;
  onAlarmClick?: (alarm: AlarmWithWheelchair) => void; // ‼️ [신규]
}

// --- 헬퍼 함수들 (변경 없음) ---
const getSeverityClass = (alarmType: string) => {
  switch (alarmType) {
    case 'FALL':
    case 'OBSTACLE':
      return styles.severityDotCritical;
    case 'LOW_VOLTAGE':
    case 'SLOPE_WARNING':
      return styles.severityDotWarning;
    default:
      return styles.severityDotInfo;
  }
};

const getAlarmMessage = (alarm: AlarmWithWheelchair) => {
  switch (alarm.alarmType) {
    case 'FALL':
      return '낙상 감지 이벤트 발생';
    case 'LOW_VOLTAGE':
      return `배터리 저전압 경고 (${alarm.alarmCondition})`;
    case 'OBSTACLE':
      return '장애물 감지';
    case 'SLOPE_WARNING':
      return '급경사로 경고';
    default:
      return alarm.alarmCondition || alarm.alarmType;
  }
};

const formatTime = (dateInput: Date | string) => {
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '시간정보 없음';

    return formatInTimeZone(date, 'Asia/Seoul', 'aaa h:mm:ss', {
      locale: ko,
    });
  } catch {
    return '시간 오류';
  }
};
// --- 헬퍼 함수 끝 ---

export default function AlertList({
  alarms,
  title,
  showViewAllButton = false,
  onAlarmClick, // ‼️ [수정 2] prop 받기
}: AlertListProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h3 className={styles.title}>{title}</h3>

            {showViewAllButton && (
              <button
                onClick={() => setIsModalOpen(true)}
                className={styles.viewAllButton}
              >
                전체보기 ⮞
              </button>
            )}
          </div>
        </div>

        <div className={styles.list}>
          {alarms.map((alarm) => (
            // ‼️ [수정 3] 개별 알람 항목에 onClick 이벤트 및 스타일 적용
            <div
              key={alarm.id}
              className={`${styles.item} ${
                onAlarmClick ? styles.clickableItem : '' // ‼️ [신규] 클릭 가능 클래스
              }`}
              // ‼️ [신규] 클릭 핸들러 연결
              onClick={() => onAlarmClick && onAlarmClick(alarm)}
            >
              <div className={styles.itemContent}>
                <div
                  className={`${styles.severityDot} ${getSeverityClass(
                    alarm.alarmType
                  )}`}
                />
                <div className={styles.itemInner}>
                  <div className={styles.itemHeader}>
                    <span className={styles.itemName}>
                      {alarm.wheelchair?.deviceSerial ||
                        `휠체어 ID: ${alarm.wheelchairId}`}
                    </span>
                    <span className={styles.itemTime}>
                      {formatTime(alarm.alarmTime)}
                    </span>
                  </div>
                  <p className={styles.itemMessage}>{getAlarmMessage(alarm)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {alarms.length === 0 && (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>알람이 없습니다</p>
          </div>
        )}
      </div>

      <EventModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={title}
        alarms={alarms}
      />
    </>
  );
}
