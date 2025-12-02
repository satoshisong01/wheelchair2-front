'use client';

import styles from './EventModal.module.css';

const safeDate = (dateStr: string | Date | undefined) => {
  if (!dateStr) return '-';
  try {
    // Safari 호환성: "2025-12-01 12:00:00" -> "2025-12-01T12:00:00" 변환
    const safeStr =
      typeof dateStr === 'string' ? dateStr.replace(' ', 'T') : dateStr;
    return new Date(safeStr).toLocaleString('ko-KR');
  } catch (e) {
    return String(dateStr); // 에러나면 원본 출력
  }
};

// ⭐️ [FIX] 유연한 AlarmItem 타입 정의 (deviceSerial 포함)
interface AlarmItem {
  id?: string | number;
  wheelchairId?: string | number;

  // DB 컬럼(snake_case)과 API 응답(camelCase) 모두 호환
  alarmType?: string;
  alarm_type?: string;

  message?: string;
  alarmCondition?: string;
  alarm_condition?: string;

  alarmTime?: string | Date;
  alarm_time?: string | Date;

  // ⭐️ 핵심: 차량 시리얼 번호
  deviceSerial?: string;
  device_serial?: string;

  [key: string]: any;
}

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  alarms: AlarmItem[];
}

export default function EventModal({
  isOpen,
  onClose,
  title,
  alarms,
}: EventModalProps) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button onClick={onClose} className={styles.modalCloseButton}>
            &times;
          </button>
        </div>

        {/* 컨텐츠 (테이블) */}
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
                alarms.map((alarm, index) => {
                  // 데이터 안전하게 꺼내기 (camelCase ?? snake_case)
                  const serial =
                    alarm.deviceSerial || alarm.device_serial || '-';
                  const type = alarm.alarmType || alarm.alarm_type || 'Unknown';
                  const msg =
                    alarm.message ||
                    alarm.alarmCondition ||
                    alarm.alarm_condition ||
                    '';
                  const time = alarm.alarmTime || alarm.alarm_time;

                  return (
                    <tr key={alarm.id || index}>
                      {/* ⭐️ 1. 차량명 (시리얼 번호) */}
                      <td>
                        <strong>{serial}</strong>
                      </td>

                      {/* 2. 경고 정보 */}
                      <td>
                        {type} {msg ? `(${msg})` : ''}
                      </td>

                      {/* 3. 시간 */}
                      <td>{safeDate(time)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={3}
                    style={{ textAlign: 'center', padding: '20px' }}
                  >
                    이벤트가 없습니다.
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
