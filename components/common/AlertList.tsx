// 경로: components/common/AlertList.tsx
// 📝 설명: 타입 호환성을 위해 인터페이스 확장 (Index Signature 추가)

'use client';

import { useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { ko } from 'date-fns/locale/ko';
import EventModal from './EventModal';
import styles from './AlertList.module.css';

// ⭐️ [수정] 어떤 형태의 알람 객체가 와도 허용하도록 유연하게 정의
interface AlarmItem {
  id?: string | number;
  wheelchairId?: string | number; // number도 허용 (호환성)
  wheelchair_id?: string | number;
  alarmType?: string;
  message?: string;
  alarmCondition?: string;
  alarmTime?: string | Date;
  alarm_time?: string | Date;
  wheelchair?: {
    deviceSerial?: string;
    device_serial?: string;
  };
  // ⭐️ [핵심] 다른 필드(statusId, alarmStatus 등)가 있어도 무시하도록 허용
  [key: string]: any;
}

interface AlertListProps {
  alarms: AlarmItem[];
  title: string;
  showViewAllButton?: boolean;
  onAlarmClick?: (alarm: AlarmItem) => void;
  onViewAllClick?: () => void;
}

// --- 헬퍼 함수들 ---
const getSeverityClass = (alarmType: string = '') => {
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

const getAlarmMessage = (alarm: AlarmItem) => {
  if (alarm.message) return alarm.message;
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
      return alarm.alarmCondition || alarm.alarmType || '알 수 없는 알람';
  }
};

const formatTime = (dateInput: Date | string | undefined) => {
  if (!dateInput) return '시간정보 없음';
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

export default function AlertList({
  alarms,
  title,
  showViewAllButton = false,
  onAlarmClick,
  onViewAllClick,
}: AlertListProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleViewAll = () => {
    if (onViewAllClick) {
      onViewAllClick();
    } else {
      setIsModalOpen(true);
    }
  };

  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h3 className={styles.title}>{title}</h3>
            {showViewAllButton && (
              <button onClick={handleViewAll} className={styles.viewAllButton}>
                전체보기 ⮞
              </button>
            )}
          </div>
        </div>

        <div className={styles.list}>
          {alarms.map((alarm, index) => {
            // Key 생성 (Date.now 제거됨)
            const uniqueKey = alarm.id
              ? `${alarm.id}-${index}`
              : `alarm-${index}-${alarm.alarmType || 'unknown'}`;

            const serial =
              alarm.wheelchair?.deviceSerial || alarm.wheelchair?.device_serial;
            const wcId = alarm.wheelchairId || alarm.wheelchair_id;

            return (
              <div
                key={uniqueKey}
                className={`${styles.item} ${
                  onAlarmClick ? styles.clickableItem : ''
                }`}
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
                        {serial
                          ? serial
                          : `휠체어 ID: ${String(wcId).slice(0, 8)}...`}
                      </span>
                      <span className={styles.itemTime}>
                        {formatTime(alarm.alarmTime || alarm.alarm_time)}
                      </span>
                    </div>
                    <p className={styles.itemMessage}>
                      {getAlarmMessage(alarm)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
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
