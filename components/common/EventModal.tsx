'use client';

import { formatInTimeZone } from 'date-fns-tz/formatInTimeZone';
import { Alarm } from '@/entities/Alarm';
import styles from './EventModal.module.css'; // 1. 전용 CSS 파일을 import

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  alarms: Alarm[];
}

export default function EventModal({
  isOpen,
  onClose,
  title,
  alarms,
}: EventModalProps) {
  if (!isOpen) return null;

  // 한국 시간대 (KST)
  const TIME_ZONE = 'Asia/Seoul';

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button onClick={onClose} className={styles.modalCloseButton}>
            &times;
          </button>
        </div>
        <div className={styles.modalContent}>
          <table className={styles.modalTable}>
            <thead>
              <tr>
                <th>차량명</th>
                <th>경고 정보</th>
                <th>시간</th>
              </tr>
            </thead>
            <tbody>
              {alarms.length > 0 ? (
                alarms.map((alarm) => (
                  <tr key={alarm.id}>
                    <td>{alarm.imei}</td>
                    <td>{alarm.alarmType}</td>
                    <td>
                      {formatInTimeZone(
                        new Date(alarm.alarmTime),
                        TIME_ZONE,
                        'yyyy/MM/dd HH:mm:ss'
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center' }}>
                    데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
