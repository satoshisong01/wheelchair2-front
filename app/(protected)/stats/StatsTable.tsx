// 📍 경로: components/stats/StatsTable.tsx

import React from 'react';
import styles from '@/app/(protected)/stats/page.module.css'; // styles 경로 수정 필요
import { MetricType, TableRowData } from './StatsTypes'; // StatsTypes import

interface StatsTableProps {
  tableData: TableRowData[];
  selectedMetric: MetricType;
  isLoading: boolean;
}

const StatsTable: React.FC<StatsTableProps> = ({ tableData, selectedMetric, isLoading }) => {
  return (
    <div className={styles.tableContainer}>
      <h3 className={styles.tableTitle}>상세 데이터 로그</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>날짜</th>
            <th>차량명</th>
            <th className={selectedMetric === 'BATTERY' ? styles.highlightHeader : ''}>
              배터리 잔량
            </th>
            <th className={selectedMetric === 'SPEED' ? styles.highlightHeader : ''}>평균 속도</th>
            <th className={selectedMetric === 'DISTANCE' ? styles.highlightHeader : ''}>
              주행 거리
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={5} className={styles.loadingCell}>
                로딩 중...
              </td>
            </tr>
          ) : tableData.length > 0 ? (
            tableData.map((row, idx) => (
              <tr key={idx}>
                <td>{row.date}</td>
                <td>{row.deviceName}</td>
                <td className={selectedMetric === 'BATTERY' ? styles.highlightBattery : ''}>
                  <strong>{row.battery}%</strong>
                </td>

                <td className={selectedMetric === 'SPEED' ? styles.highlightSpeed : ''}>
                  <span>{row.speed} m/s</span>
                </td>

                <td className={selectedMetric === 'DISTANCE' ? styles.highlightDistance : ''}>
                  <span>{row.distance} m</span>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className={styles.emptyCell}>
                데이터가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default StatsTable;
