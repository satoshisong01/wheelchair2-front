// 📍 경로: components/stats/StatsFilters.tsx

import React from 'react';
import DateRangePicker from '@/components/ui/DateRangePicker';
import styles from '@/app/(protected)/stats/page.module.css'; // styles 경로 수정 필요
import { MetricType, TimeUnitType, ChartModeType, HOUR_OPTIONS, DeviceInfo } from './StatsTypes'; // StatsTypes import

interface StatsFiltersProps {
  // 상태
  periodType: 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';
  timeUnit: TimeUnitType;
  chartMode: ChartModeType;
  startDate: Date;
  endDate: Date;
  compareDateA: Date;
  compareDateB: Date;
  startHour: string;
  endHour: string;
  selectedDevice: string;
  selectedRegion: string;
  devices: DeviceInfo[];
  regions: string[];
  isManager: boolean;
  isLoading: boolean;

  // 핸들러
  setPeriodType: (type: 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM') => void;
  setTimeUnit: (unit: TimeUnitType) => void;
  handleDateChangeStart: (date: Date) => void;
  handleDateChangeEnd: (date: Date) => void;
  setCompareDateA: (date: Date) => void;
  setCompareDateB: (date: Date) => void;
  setStartHour: (hour: string) => void;
  setEndHour: (hour: string) => void;
  setSelectedDevice: (id: string) => void;
  setSelectedRegion: (region: string) => void;
  handleSearch: () => void;
  handleModeChange: (mode: ChartModeType) => void;
}

const StatsFilters: React.FC<StatsFiltersProps> = ({
  // 상태 값 구조분해 할당 (Props)
  periodType,
  timeUnit,
  chartMode,
  startDate,
  endDate,
  compareDateA,
  compareDateB,
  startHour,
  endHour,
  selectedDevice,
  selectedRegion,
  devices,
  regions,
  isManager,
  isLoading,

  // 핸들러 함수 구조분해 할당 (Props)
  setPeriodType,
  setTimeUnit,
  handleDateChangeStart,
  handleDateChangeEnd,
  setCompareDateA,
  setCompareDateB,
  setStartHour,
  setEndHour,
  setSelectedDevice,
  setSelectedRegion,
  handleSearch,
  handleModeChange,
}) => {
  const isHourly = chartMode === 'COMPARE' || timeUnit === 'hourly';

  return (
    <div className={styles.filterBox}>
      {/* 모드 선택 필터 */}
      <div className={styles.filterGroup}>
        <label>조회 모드</label>
        <select
          value={chartMode}
          onChange={(e) => handleModeChange(e.target.value as ChartModeType)}
          className={styles.select}
        >
          <option value="RANGE">기간 범위</option>
          <option value="COMPARE">특정일 비교</option>
        </select>
      </div>

      <div className={styles.filterGroup}>
        <label>단위 선택</label>
        <select
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value as any)}
          className={styles.select}
          disabled={chartMode === 'COMPARE'}
        >
          <option value="WEEKLY">최근 7일</option>
          <option value="MONTHLY">이번 달</option>
          <option value="YEARLY">올해</option>
          <option value="CUSTOM">직접 선택</option>
        </select>
      </div>

      <div className={styles.filterGroup}>
        <label>집계 단위</label>
        <select
          value={timeUnit}
          onChange={(e) => setTimeUnit(e.target.value as TimeUnitType)}
          className={styles.select}
          disabled={chartMode === 'COMPARE'}
        >
          <option value="daily">일별</option>
          <option value="hourly">시간별</option>
        </select>
      </div>

      {/* 시간 선택 필터 (시간별/비교 모드일 때만 표시) */}
      {(chartMode === 'COMPARE' || timeUnit === 'hourly') && (
        <div className={styles.filterGroup}>
          <label>시간 범위</label>
          <div className={styles.timeRangeWrapper}>
            <select
              value={startHour}
              onChange={(e) => setStartHour(e.target.value)}
              className={styles.select}
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={`sh-${h}`} value={h}>
                  {h}시
                </option>
              ))}
            </select>
            <span className={styles.timeSeparator}>~</span>
            <select
              value={endHour}
              onChange={(e) => setEndHour(e.target.value)}
              className={styles.select}
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={`eh-${h}`} value={h}>
                  {h}시
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className={styles.filterGroup}>
        <label>{chartMode === 'COMPARE' ? '비교 일자' : '기간 선택'}</label>

        <div className={styles.datePickerWrapper}>
          {chartMode === 'RANGE' ? (
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChangeStart={handleDateChangeStart}
              onChangeEnd={handleDateChangeEnd}
            />
          ) : (
            <DateRangePicker
              startDate={compareDateA}
              endDate={compareDateB}
              onChangeStart={setCompareDateA}
              onChangeEnd={setCompareDateB}
            />
          )}
        </div>
      </div>

      {isManager && (
        <div className={styles.filterGroup}>
          <label>차량명(Serial)</label>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className={styles.select}
          >
            {devices.map((dev) => (
              <option key={dev.id} value={dev.id}>
                {dev.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.filterGroup}>
        <label>주소 정보</label>
        <select
          value={selectedRegion}
          onChange={(e) => setSelectedRegion(e.target.value)}
          className={styles.select}
        >
          {regions.map((reg) => (
            <option key={reg} value={reg}>
              {reg}
            </option>
          ))}
        </select>
      </div>

      <button onClick={handleSearch} className={styles.searchButton} disabled={isLoading}>
        검색
      </button>
    </div>
  );
};

export default StatsFilters;
