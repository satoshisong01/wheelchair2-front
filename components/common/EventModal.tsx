'use client';

// [수정] date-fns/tz 임포트 경로 수정 (formatInTimeZone)
import { formatInTimeZone } from 'date-fns-tz';
import { ko } from 'date-fns/locale/ko';

// 🚨 [FIX] 엔티티 import 제거
// import { Alarm } from '@/entities/Alarm';

import styles from './EventModal.module.css';

// ⭐️ [FIX] 유연한 AlarmItem 타입 정의 (Alarm 엔티티 대체 및 호환성 확보)
interface AlarmItem {
  id?: string | number;
  imei?: string;
  wheelchairId?: string | number;
  wheelchair_id?: string | number;
  alarmType?: string;
  alarmTime?: string | Date;
  alarm_time?: string | Date;
  alarmCondition?: string;
  [key: string]: any;
}

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  // 🚨 [FIX] Alarm 대신 유연한 AlarmItem 배열을 받습니다.
  alarms: AlarmItem[];
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
                alarms.map((alarm, index) => (
                  // 🚨 [FIX] Key 에러 방지: ID가 없으면 index와 time을 조합 (ID가 string/UUID 임을 전제)
                  <tr
                    key={
                      String(alarm.id || index) +
                      String(alarm.alarmTime || alarm.alarm_time)
                    }
                  >
                    <td>{alarm.imei || '-'}</td>
                    <td>
                      {alarm.alarmType || alarm.alarmCondition || '정보 없음'}
                    </td>
                    <td>
                      {/* alarmTime과 alarm_time 중 존재하는 것을 사용 */}
                      {alarm.alarmTime || alarm.alarm_time
                        ? formatInTimeZone(
                            new Date(alarm.alarmTime || alarm.alarm_time),
                            TIME_ZONE,
                            'yyyy/MM/dd HH:mm:ss'
                          )
                        : 'N/A'}
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
