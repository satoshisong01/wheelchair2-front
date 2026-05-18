// 📍 경로: components/stats/StatsChartRenderer.tsx

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import styles from '@/app/(protected)/stats/page.module.css'; // styles 경로 수정 필요
import {
  MetricType,
  TimeUnitType,
  ChartModeType,
  AggregatedData,
  METRIC_CONFIG,
  formatDateString,
} from './StatsTypes'; // StatsTypes import
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// (Chart.js 등록은 StatsPage.tsx에서 이미 처리되었음을 가정)

interface StatsChartRendererProps {
  apiRawData: AggregatedData[];
  selectedMetric: MetricType;
  chartType: 'BAR' | 'LINE';
  timeUnit: TimeUnitType;
  chartMode: ChartModeType;
  compareDateA: Date;
  compareDateB: Date;
  startHour: string;
  endHour: string;
  isLoading: boolean;
  aiAnalysisComment: string | null;
  setSelectedMetric: (metric: MetricType) => void;
  setChartType: (type: 'BAR' | 'LINE') => void;
}

const StatsChartRenderer: React.FC<StatsChartRendererProps> = ({
  apiRawData,
  selectedMetric,
  chartType,
  timeUnit,
  chartMode,
  compareDateA,
  compareDateB,
  startHour,
  endHour,
  isLoading,
  aiAnalysisComment,
  setSelectedMetric,
  setChartType,
}) => {
  const [chartData, setChartData] = useState<any>(null);
  const config = METRIC_CONFIG[selectedMetric];
  const isHourly = chartMode === 'COMPARE' || timeUnit === 'hourly';

  // Metric에 따라 원하는 지표 값(평균 또는 최대값)을 가져오는 함수
  const getDataValue = useCallback(
    (d: AggregatedData) => {
      if (!d) return 0;
      switch (selectedMetric) {
        case 'BATTERY':
          return d.avgBattery;
        case 'SPEED':
          return d.avgSpeed;
        case 'DISTANCE':
          return d.avgDistance;
        default:
          return 0;
      }
    },
    [selectedMetric],
  );

  // --- Chart Data 매핑 로직 ---
  useEffect(() => {
    if (apiRawData.length === 0) {
      setChartData(null);
      return;
    }

    let labels: string[] = [];
    let datasets: any[] = [];

    if (chartMode === 'COMPARE') {
      const start = parseInt(startHour);
      const end = parseInt(endHour);
      labels = Array.from({ length: end - start + 1 }, (_, i) => {
        const hour = String(start + i).padStart(2, '0');
        return `${hour}시`;
      });
    }

    if (chartMode === 'COMPARE') {
      const dateAStr = formatDateString(compareDateA);
      const dateBStr = formatDateString(compareDateB);

      const rawDataA = apiRawData.filter((d) => d.source === dateAStr);
      const rawDataB = apiRawData.filter((d) => d.source === dateBStr);

      const sortedDataA = rawDataA.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      const sortedDataB = rawDataB.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      const mappedDataA = labels.map((label) => {
        const hour = label.replace('시', '');
        const found = sortedDataA.find((d) => d.date.substring(11, 13) === hour);
        return getDataValue(found as AggregatedData);
      });

      const mappedDataB = labels.map((label) => {
        const hour = label.replace('시', '');
        const found = sortedDataB.find((d) => d.date.substring(11, 13) === hour);
        return getDataValue(found as AggregatedData);
      });

      datasets.push({
        label: `${config.label} (${dateAStr})`,
        data: mappedDataA,
        backgroundColor: chartType === 'BAR' ? config.color : config.bgColor,
        borderColor: config.color,
        borderWidth: 2,
        fill: chartType === 'LINE',
        tension: 0.3,
      });

      datasets.push({
        label: `${config.label} (${dateBStr})`,
        data: mappedDataB,
        backgroundColor: config.colorCompare,
        borderColor: config.colorCompare,
        borderWidth: 2,
        fill: chartType === 'LINE',
        tension: 0.3,
      });
    } else {
      // RANGE 모드
      const sortedData = apiRawData.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      if (isHourly) {
        // 시간별 보기 (일자 + 시간)
        labels = sortedData.map((d) => {
          const datePart = d.date.substring(5, 10);
          const timePart = d.date.substring(11, 13);
          return `${datePart} ${timePart}시`;
        });
      } else {
        // 일별 보기 (일자)
        labels = sortedData.map((d) => d.date.substring(5, 10));
      }

      const data = sortedData.map(getDataValue);

      datasets.push({
        label: `${config.label} (${config.unit})`,
        data: data,
        backgroundColor: chartType === 'BAR' ? config.color : config.bgColor,
        borderColor: config.color,
        borderWidth: 2,
        fill: chartType === 'LINE',
        tension: 0.3,
      });
    }

    setChartData({
      labels: labels,
      datasets: datasets,
    });
  }, [
    apiRawData,
    selectedMetric,
    chartType,
    timeUnit,
    chartMode,
    compareDateA,
    compareDateB,
    startHour,
    endHour,
    getDataValue, // getDataValue 의존성 추가
    config.label, // config 의존성 추가
    config.unit,
    config.color,
    config.bgColor,
    config.colorCompare,
  ]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' as const },
        title: {
          display: true,
          text: `${config.label} 변화 추이 (${
            chartMode === 'COMPARE'
              ? '특정일 비교 (시간별)'
              : timeUnit === 'hourly'
              ? '시간별'
              : '일별'
          })`,
        },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 10,
          cornerRadius: 4,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          max: config.yMax,
          grid: { color: '#e0e0e0', borderDash: [5, 5] },
          title: {
            display: true,
            text: config.unit,
          },
        },
        x: {
          grid: { display: false },
        },
      },
    }),
    [config, chartMode, timeUnit],
  );

  return (
    <>
      {aiAnalysisComment && (
        <div className={styles.aiAnalysisBox}>
          <h4>✨ 분석 리포트</h4>
          {/* 🔒 [보안] AI 응답을 dangerouslySetInnerHTML 없이 안전하게 렌더링 (줄바꿈만 <br/>로 처리) */}
          <div className={styles.aiAnalysisContent}>
            {aiAnalysisComment.split('\n').map((line, idx, arr) => (
              <span key={idx}>
                {line}
                {idx < arr.length - 1 && <br />}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <h3>📊 데이터 시각화</h3>
          <div className={styles.chartControls}>
            {/* Metric Toggle */}
            <div className={styles.metricToggle}>
              <button
                className={selectedMetric === 'BATTERY' ? styles.activeMetricBattery : ''}
                onClick={() => setSelectedMetric('BATTERY')}
              >
                배터리
              </button>
              <button
                className={selectedMetric === 'SPEED' ? styles.activeMetricSpeed : ''}
                onClick={() => setSelectedMetric('SPEED')}
              >
                속도
              </button>
              <button
                className={selectedMetric === 'DISTANCE' ? styles.activeMetricDistance : ''}
                onClick={() => setSelectedMetric('DISTANCE')}
              >
                주행거리
              </button>
            </div>
            <div className={styles.divider}></div>
            <div className={styles.chartToggle}>
              <button
                className={chartType === 'BAR' ? styles.activeType : ''}
                onClick={() => setChartType('BAR')}
              >
                막대
              </button>

              <button
                className={chartType === 'LINE' ? styles.activeType : ''}
                onClick={() => setChartType('LINE')}
              >
                선
              </button>
            </div>
          </div>
        </div>

        <div className={styles.canvasWrapper}>
          {isLoading ? (
            <div className={styles.loadingSpinnerWrapper}>
              <LoadingSpinner text="데이터를 분석 중입니다." />
            </div>
          ) : chartData ? (
            chartType === 'BAR' ? (
              <Bar key="bar-chart" options={chartOptions} data={chartData} />
            ) : (
              <Line key="line-chart" options={chartOptions} data={chartData} />
            )
          ) : (
            <p className={styles.noData}>데이터가 없습니다.</p>
          )}
        </div>
      </div>
    </>
  );
};

export default StatsChartRenderer;
