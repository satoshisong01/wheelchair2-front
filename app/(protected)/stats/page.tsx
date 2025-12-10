'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import styles from './page.module.css';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import DateRangePicker from '@/components/ui/DateRangePicker';

// Chart.js 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const formatDateString = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// 시간 옵션 배열 (00 ~ 23)
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, '0')
);

type MetricType = 'BATTERY' | 'SPEED' | 'DISTANCE';
type TimeUnitType = 'daily' | 'hourly';
type ChartModeType = 'RANGE' | 'COMPARE';

const METRIC_CONFIG = {
  BATTERY: {
    label: '평균 배터리 잔량',
    unit: '%',
    color: '#27b4e9',
    colorCompare: '#f59231',
    bgColor: 'rgba(39, 180, 233, 0.2)',
    yMax: 100,
  },
  SPEED: {
    label: '평균 속도',
    unit: 'm/s',
    color: '#ff9f40',
    colorCompare: '#34d399',
    bgColor: 'rgba(255, 159, 64, 0.2)',
    yMax: undefined,
  },
  DISTANCE: {
    label: '주행 거리',
    unit: 'm',
    color: '#4bc0c0',
    colorCompare: '#a78bfa',
    bgColor: 'rgba(75, 192, 192, 0.2)',
    yMax: undefined,
  },
};

// ⭐️ [신규 타입] API에서 받아 프론트에서 사용할 통합 데이터 구조
interface AggregatedData {
  date: string;
  source: string; // COMPARE 모드 구분을 위한 필드
  avgBattery: number;
  maxBattery: number; // MAX 배터리 필드 추가 (AI 분석용)
  avgSpeed: number;
  maxSpeed: number; // MAX 속도 필드 추가 (AI 분석용)
  avgDistance: number;
  maxDistance: number; // MAX 거리 필드 추가 (AI 분석용)
}

export default function StatsPage() {
  const { data: session, status } = useSession();
  const userRole = session?.user?.role;
  const isManager = userRole === 'ADMIN' || userRole === 'MASTER';

  const [periodType, setPeriodType] = useState<
    'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM'
  >('MONTHLY');
  const [timeUnit, setTimeUnit] = useState<TimeUnitType>('daily');
  const [chartMode, setChartMode] = useState<ChartModeType>('RANGE');

  const today = new Date();
  const [startDate, setStartDate] = useState<Date>(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [endDate, setEndDate] = useState<Date>(today);
  const [compareDateA, setCompareDateA] = useState<Date>(
    new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
  );
  const [compareDateB, setCompareDateB] = useState<Date>(today);

  const [startHour, setStartHour] = useState<string>('09');
  const [endHour, setEndHour] = useState<string>('18');

  const [selectedDevice, setSelectedDevice] = useState('ALL');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [chartType, setChartType] = useState<'BAR' | 'LINE'>('BAR');
  // ⭐️ [수정] 차트/테이블 표시용 지표 선택 상태 유지
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('BATTERY');

  // ⭐️ [수정] API Raw Data 타입을 AggregatedData 배열로 명확히 지정
  const [apiRawData, setApiRawData] = useState<AggregatedData[]>([]);
  const [chartData, setChartData] = useState<any>(null);
  const [tableData, setTableData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiAnalysisComment, setAiAnalysisComment] = useState<string | null>(
    null
  );
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([
    { id: 'ALL', name: '전체 기기' },
  ]);
  const regions = ['전체 지역', '경기도', '서울시', '인천시'];
  const [mySerial, setMySerial] = useState<string>('');
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // --- useEffect: 인증 및 기기 목록 로딩 ---
  useEffect(() => {
    if (status === 'authenticated' && !isManager) {
      const myId = (session?.user as any)?.wheelchairId;
      if (myId) {
        // ⭐️ [수정] 관리자가 아닌 경우 deviceId는 id로 설정 (백엔드에서 serial로 변환됨)
        setSelectedDevice(String(myId));

        fetch('/api/device-info')
          .then((res) => res.json())
          .then((data) => {
            if (data.serial) setMySerial(data.serial);
          })
          .catch((err) => console.error('시리얼 조회 실패:', err));
      }
    }
    const fetchDevices = async () => {
      if (!isManager) return;
      try {
        const res = await fetch('/api/wheelchairs');
        if (res.ok) {
          const data = await res.json();
          const realDevices = data.map((d: any) => ({
            // ⭐️ [수정] 기기 ID 대신 Serial을 사용 (Timestream 쿼리 효율을 위해)
            id: d.device_serial,
            name: d.device_serial
              ? `${d.device_serial} ${d.model_name ? `(${d.model_name})` : ''}`
              : `기기 ${d.id}`,
          }));
          setDevices([{ id: 'ALL', name: '전체 기기' }, ...realDevices]);
        }
      } catch (error) {
        console.error('기기 목록 로딩 실패:', error);
      }
    };
    fetchDevices();
  }, [status, isManager, session]);

  // --- useEffect: 기간 설정 및 초기 로딩 ---
  useEffect(() => {
    const now = new Date();
    let newStart = new Date();
    let newEnd = new Date();

    switch (periodType) {
      case 'WEEKLY':
        newStart.setDate(now.getDate() - 7);
        newEnd = now;
        break;
      case 'MONTHLY':
        newStart = new Date(now.getFullYear(), now.getMonth(), 1);
        newEnd = now;
        break;
      case 'YEARLY':
        newStart = new Date(now.getFullYear(), 0, 1);
        newEnd = now;
        break;
      case 'CUSTOM':
        return;
    }
    setStartDate(newStart);
    setEndDate(newEnd);
  }, [periodType]);

  // ⭐️ [수정] 초기 로딩 시 검색 실행
  useEffect(() => {
    // 세션 인증이 완료되고, 처음 로드될 때만 검색 실행
    if (isInitialLoad && status === 'authenticated') {
      // ⚠️ [주의] setSelectedDevice가 먼저 완료된 후 handleSearch가 실행되어야 함.
      // selectedDevice에 의존성이 있지만, initialLoad 플래그를 통해 한 번만 실행되게 합니다.
      setTimeout(handleSearch, 100);
      setIsInitialLoad(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isInitialLoad, selectedDevice, mySerial]);

  // --- 핸들러 함수 ---
  const handleDateChangeStart = (date: Date) => {
    setStartDate(date);
    setPeriodType('CUSTOM');
  };
  const handleDateChangeEnd = (date: Date) => {
    setEndDate(date);
    setPeriodType('CUSTOM');
  };

  const handleModeChange = (mode: ChartModeType) => {
    setChartMode(mode);
    if (mode === 'COMPARE') {
      setTimeUnit('hourly');
    }
  };

  // --- 데이터 검색 및 테이블 매핑 (POST 요청) ---
  const handleSearch = useCallback(async () => {
    // DEVICE_USER가 ALL을 선택할 수 없도록 방지
    if (!isManager && selectedDevice === 'ALL') return;

    setIsLoading(true);
    setAiAnalysisComment(null);

    let postBody: any;

    const isHourly = chartMode === 'COMPARE' || timeUnit === 'hourly';
    const startH = isHourly ? startHour : '00';
    const endH = isHourly ? endHour : '23';

    if (isHourly && parseInt(startH) >= parseInt(endH)) {
      alert('시작 시간은 종료 시간보다 빨라야 합니다.');
      setIsLoading(false);
      return;
    }

    // ⭐️ [수정] POST body에서 metric 제거
    if (chartMode === 'COMPARE') {
      postBody = {
        mode: 'COMPARE',
        compareDates: [
          formatDateString(compareDateA),
          formatDateString(compareDateB),
        ],
        deviceId: selectedDevice,
        unit: 'hourly',
        startHour: startH,
        endHour: endH,
      };
    } else {
      postBody = {
        mode: 'RANGE',
        startDate: formatDateString(startDate),
        endDate: formatDateString(endDate),
        deviceId: selectedDevice,
        unit: timeUnit,
        startHour: startH,
        endHour: endH,
      };
    }

    // ⭐️ [추가] AI 분석을 위해 선택된 Metric을 추가 (이후 API 호출에 사용)
    postBody.metric = selectedMetric;

    try {
      const res = await fetch(`/api/stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody),
      });

      const responseBody = await res.json();

      if (!res.ok) {
        throw new Error(
          responseBody.message || '통계 데이터를 불러오지 못했습니다.'
        );
      }

      // ⭐️ [수정] 백엔드에서 받은 데이터는 이미 통합된 AggregatedData 구조임
      const apiData: AggregatedData[] = responseBody.data;
      const aiComment = responseBody.comment;
      const queryResult = responseBody.query;

      console.log('🤖 [Timestream Query]:', queryResult);

      if (!Array.isArray(apiData) || apiData.length === 0) {
        setApiRawData([]);
        setChartData(null);
        setTableData([]);
        setAiAnalysisComment(aiComment || '데이터가 없습니다.');
        return;
      }

      setApiRawData(apiData);
      setAiAnalysisComment(aiComment);

      const currentDeviceObj = devices.find((d) => d.id === selectedDevice);
      let displayDeviceName = '전체 평균';
      if (selectedDevice !== 'ALL') {
        if (isManager) {
          displayDeviceName = currentDeviceObj
            ? currentDeviceObj.name
            : selectedDevice;
        } else {
          displayDeviceName = mySerial ? `내 기기 (${mySerial})` : '내 기기';
        }
      }

      // ⭐️ [수정] Table Data 매핑 시, 모든 지표 값을 그대로 사용
      setTableData(
        apiData.map((d) => ({
          date: isHourly ? d.date.substring(5, 16) : d.date.substring(5, 10),
          deviceName: displayDeviceName,
          serial: '-',
          battery: d.avgBattery,
          speed: d.avgSpeed,
          distance: d.avgDistance,
          // maxBattery, maxSpeed, maxDistance 등 추가 정보는 차트나 AI 분석에만 사용
        }))
      );
    } catch (error) {
      console.error('데이터 로딩 실패:', error);
      setApiRawData([]);
      setChartData(null);
      setTableData([]);
      setAiAnalysisComment(`데이터 로딩 실패: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [
    startDate,
    endDate,
    compareDateA,
    compareDateB,
    chartMode,
    selectedDevice,
    selectedMetric, // ⭐️ [수정] selectedMetric이 변경되어도 handleSearch가 호출되도록 의존성 추가
    timeUnit,
    startHour,
    endHour,
    devices,
    isManager,
    mySerial,
  ]);

  // ⭐️ [추가] Metric 변경 시 API 호출 대신 차트/테이블만 다시 렌더링
  // Metric 변경 시 API 재호출을 막기 위해, 이 useEffect를 분리하지 않고
  // 기존 차트 렌더링 useEffect에 selectedMetric 의존성을 추가하고
  // handleSearch를 selectedMetric 변경 시 호출되도록 위에서 설정합니다.
  // 이로 인해 Metric 변경 시에도 데이터는 다시 불러오지만 (AI 분석을 위해),
  // 적어도 사용자는 Metric 전환 시 데이터가 없는 현상을 겪지 않습니다.

  // --- Chart 렌더링 로직 (고정 시간축 적용) ---
  useEffect(() => {
    // ⭐️ [수정] apiRawData 뿐만 아니라 selectedMetric이 변경되어도 차트 갱신
    if (apiRawData.length === 0) {
      setChartData(null);
      return;
    }

    const config = METRIC_CONFIG[selectedMetric];
    let labels: string[] = [];
    let datasets: any[] = [];

    // ⭐️ [수정] Metric에 따라 원하는 지표 값(평균 또는 최대값)을 가져오는 함수
    const getDataValue = (d: AggregatedData) => {
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
    };

    const isHourly = chartMode === 'COMPARE' || timeUnit === 'hourly';

    // X축 라벨 생성 (시간별 모드에서 고정 시간축)
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

      // 데이터 정렬: 시계열 데이터가 시간 순서대로 정렬되도록 보장
      const sortedDataA = rawDataA.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      const sortedDataB = rawDataB.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // ⭐️ [수정] COMPARE 모드에서 Time Bin을 라벨과 매핑
      const mappedDataA = labels.map((label) => {
        const hour = label.replace('시', '');
        // timeStr: 2025-12-10 09:00:00.000000000
        const found = sortedDataA.find(
          (d) => d.date.substring(11, 13) === hour
        );
        return getDataValue(found as AggregatedData);
      });

      const mappedDataB = labels.map((label) => {
        const hour = label.replace('시', '');
        const found = sortedDataB.find(
          (d) => d.date.substring(11, 13) === hour
        );
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
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
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
    selectedMetric, // ⭐️ [수정] Metric 변경 시 차트 갱신
    chartType,
    timeUnit,
    chartMode,
    compareDateA,
    compareDateB,
    startHour,
    endHour,
  ]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      title: {
        display: true,
        text: `${METRIC_CONFIG[selectedMetric].label} 변화 추이 (${
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
        max: METRIC_CONFIG[selectedMetric].yMax,
        grid: { color: '#e0e0e0', borderDash: [5, 5] },
        title: {
          display: true,
          text: METRIC_CONFIG[selectedMetric].unit,
        },
      },
      x: {
        grid: { display: false },
      },
    },
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>통계 정보</h1>
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
                onChangeStart={(date) => setCompareDateA(date)}
                onChangeEnd={(date) => setCompareDateB(date)}
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

        <button onClick={handleSearch} className={styles.searchButton}>
          검색
        </button>
      </div>

      {aiAnalysisComment && (
        <div className={styles.aiAnalysisBox}>
          <h4>✨ AI 분석 리포트</h4>
          <div
            className={styles.aiAnalysisContent}
            dangerouslySetInnerHTML={{
              __html: aiAnalysisComment.replace(/\n/g, '<br />'),
            }}
          />
        </div>
      )}

      <div className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <h3>📊 데이터 시각화</h3>
          <div className={styles.chartControls}>
            {/* ⭐️ [수정 없음] Metric Toggle은 API 호출 없이 데이터 시각화만 변경 */}
            <div className={styles.metricToggle}>
              <button
                className={
                  selectedMetric === 'BATTERY' ? styles.activeMetricBattery : ''
                }
                onClick={() => setSelectedMetric('BATTERY')}
              >
                배터리
              </button>
              <button
                className={
                  selectedMetric === 'SPEED' ? styles.activeMetricSpeed : ''
                }
                onClick={() => setSelectedMetric('SPEED')}
              >
                속도
              </button>
              <button
                className={
                  selectedMetric === 'DISTANCE'
                    ? styles.activeMetricDistance
                    : ''
                }
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
              <LoadingSpinner text="AI가 데이터를 분석 중입니다." />
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
      <div className={styles.tableContainer}>
        <h3 className={styles.tableTitle}>상세 데이터 로그</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>날짜</th>
              <th>차량명</th>
              <th
                className={
                  selectedMetric === 'BATTERY' ? styles.highlightHeader : ''
                }
              >
                배터리 잔량
              </th>
              <th
                className={
                  selectedMetric === 'SPEED' ? styles.highlightHeader : ''
                }
              >
                평균 속도
              </th>
              <th
                className={
                  selectedMetric === 'DISTANCE' ? styles.highlightHeader : ''
                }
              >
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
                  <td
                    className={
                      selectedMetric === 'BATTERY'
                        ? styles.highlightBattery
                        : ''
                    }
                  >
                    <strong>{row.battery}%</strong>
                  </td>

                  <td
                    className={
                      selectedMetric === 'SPEED' ? styles.highlightSpeed : ''
                    }
                  >
                    <span>{row.speed} m/s</span>
                  </td>

                  <td
                    className={
                      selectedMetric === 'DISTANCE'
                        ? styles.highlightDistance
                        : ''
                    }
                  >
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
    </div>
  );
}
