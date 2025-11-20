// 📍 경로: src/components/ui/DateRangePicker.tsx

import React from 'react';
import styles from './DateRangePicker.module.css'; // 💡 CSS 모듈 임포트

interface DateRangePickerProps {
  startDate: Date;
  endDate: Date;
  onChangeStart: (date: Date) => void;
  onChangeEnd: (date: Date) => void;
  // 로그가 있는 날짜 목록 (현재는 사용하지 않음)
  loggedDates?: string[];
}

// 날짜 객체를 HTML date input이 요구하는 'YYYY-MM-DD' 문자열로 변환
const dateToInputString = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onChangeStart,
  onChangeEnd,
  loggedDates,
}) => {
  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 날짜 객체를 생성할 때 Timezone 문제가 발생하지 않도록 +1일 보정 필요 (UTC 문제 해결)
    const [year, month, day] = e.target.value.split('-').map(Number);
    const newDate = new Date(year, month - 1, day); // month - 1로 0-indexed 맞춤
    onChangeStart(newDate);
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [year, month, day] = e.target.value.split('-').map(Number);
    const newDate = new Date(year, month - 1, day);
    onChangeEnd(newDate);
  };

  return (
    // 💡 CSS 모듈 적용
    <div className={styles.dateContainer}>
      {/* 1. 시작일 선택 */}
      <input
        type="date"
        className={styles.dateInput}
        value={dateToInputString(startDate)}
        onChange={handleStartChange}
        // 종료일보다 늦게 시작할 수 없도록 제약
        max={dateToInputString(endDate)}
      />

      <span className={styles.separator}>~</span>

      {/* 2. 종료일 선택 */}
      <input
        type="date"
        className={styles.dateInput}
        value={dateToInputString(endDate)}
        onChange={handleEndChange}
        // 시작일보다 빠르게 끝날 수 없도록 제약
        min={dateToInputString(startDate)}
      />
    </div>
  );
};

export default DateRangePicker;
