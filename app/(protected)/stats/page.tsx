// app/stats/page.tsx

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
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

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
  const [compareDateB, setCompareDateB] = useState<Date>(today); // ⭐️ [추가] 시간 범위 상태 (기본값: 09시 ~ 18시)

  const [startHour, setStartHour] = useState<string>('09');
  const [endHour, setEndHour] = useState<string>('18');

  const [selectedDevice, setSelectedDevice] = useState('ALL');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [chartType, setChartType] = useState<'BAR' | 'LINE'>('BAR');
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('BATTERY');

  const [apiRawData, setApiRawData] = useState<any[]>([]);
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
  const [isInitialLoad, setIsInitialLoad] = useState(true); // --- useEffect: 인증 및 기기 목록 로딩 (유지) ---

  useEffect(() => {
    if (status === 'authenticated' && !isManager) {
      const myId = (session?.user as any)?.wheelchairId;
      if (myId) {
        setSelectedDevice(myId);

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
  }, [status, isManager, session]); // --- useEffect: 기간 설정 및 초기 로딩 (유지) ---

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

  useEffect(() => {
    if (isInitialLoad && status === 'authenticated') {
      handleSearch();
      setIsInitialLoad(false);
    } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]); // --- 핸들러 함수 ---

  const handleDateChangeStart = (date: Date) => {
    setStartDate(date);
    setPeriodType('CUSTOM');
  };
  const handleDateChangeEnd = (date: Date) => {
    setEndDate(date);
    setPeriodType('CUSTOM');
  }; // 모드 변경 시 집계 단위 강제 설정

  const handleModeChange = (mode: ChartModeType) => {
    setChartMode(mode);
    if (mode === 'COMPARE') {
      setTimeUnit('hourly'); // 특정일 비교 시 시간별로 강제
    }
  }; // 3. 데이터 검색 및 테이블 매핑 (POST 요청)

  const handleSearch = useCallback(async () => {
    if (!isManager && selectedDevice === 'ALL') return;

    setIsLoading(true);
    setAiAnalysisComment(null);

    let postBody: any;

    // ⭐️ [추가] 시작 시간/종료 시간 유효성 검사 및 설정
    const isHourly = chartMode === 'COMPARE' || timeUnit === 'hourly';
    const startH = isHourly ? startHour : '00';
    const endH = isHourly ? endHour : '23';

    if (isHourly && parseInt(startH) >= parseInt(endH)) {
      alert('시작 시간은 종료 시간보다 빨라야 합니다.');
      setIsLoading(false);
      return;
    }

    if (chartMode === 'COMPARE') {
      postBody = {
        mode: 'COMPARE',
        compareDates: [
          formatDateString(compareDateA),
          formatDateString(compareDateB),
        ], // 두 날짜 전송
        deviceId: selectedDevice,
        metric: selectedMetric,
        unit: 'hourly', // COMPARE 모드는 시간별로 강제
        startHour: startH, // ⭐️ [추가] 시작 시간
        endHour: endH, // ⭐️ [추가] 종료 시간
      };
    } else {
      postBody = {
        mode: 'RANGE',
        startDate: formatDateString(startDate),
        endDate: formatDateString(endDate),
        deviceId: selectedDevice,
        metric: selectedMetric,
        unit: timeUnit,
        startHour: startH, // ⭐️ [추가] 시작 시간
        endHour: endH, // ⭐️ [추가] 종료 시간
      };
    }
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

      const apiData = responseBody.data;
      const aiComment = responseBody.comment;
      const queryResult = responseBody.query;

      console.log('🤖 [Gemini Query]:', queryResult);

      if (!Array.isArray(apiData) || apiData.length === 0) {
        setApiRawData([]);
        setChartData(null);
        setTableData([]);
        setAiAnalysisComment(aiComment || '데이터가 없습니다.');
        return;
      }

      setApiRawData(apiData);
      setAiAnalysisComment(aiComment); // 선택된 기기 이름 찾기

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
      } // 테이블 데이터 포맷팅

      setTableData(
        apiData.map((d: any) => ({
          // 비교 모드일 경우: 날짜 + 시리얼을 보여주어 어떤 데이터인지 구분
          date: isHourly ? d.date.substring(5, 16) : d.date.substring(5, 10),
          deviceName: displayDeviceName,
          serial: '-',
          battery: d.avgBattery,
          speed: d.avgSpeed,
          distance: d.avgDistance,
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
    selectedMetric,
    timeUnit,
    startHour, // ⭐️ [추가] 시작 시간 의존성
    endHour, // ⭐️ [추가] 종료 시간 의존성
    devices,
    isManager,
    mySerial,
  ]); // --- Chart 렌더링 로직 (유지) ---

  useEffect(() => {
    if (apiRawData.length === 0) {
      setChartData(null);
      return;
    }

    const config = METRIC_CONFIG[selectedMetric];
    let labels: string[] = [];
    let datasets: any[] = [];
    const dataValues = (d: any) => {
      if (selectedMetric === 'BATTERY') return d.avgBattery;
      if (selectedMetric === 'SPEED') return d.avgSpeed;
      if (selectedMetric === 'DISTANCE') return d.avgDistance;
      return 0;
    };

    const isHourly = chartMode === 'COMPARE' || timeUnit === 'hourly';

    if (chartMode === 'COMPARE') {
      const dateAStr = formatDateString(compareDateA);
      const dateBStr = formatDateString(compareDateB);

      const dataA = apiRawData.filter((d) => d.source === dateAStr);
      const dataB = apiRawData.filter((d) => d.source === dateBStr); // 라벨: 시간(00시, 01시...)을 라벨로 사용 (시간 필터링 반영) // dataA의 date 필드에서 시간 부분만 추출 (예: 2025-12-03T09:00:00Z -> 09시)
      labels = dataA.map((d) => d.date.substring(11, 13) + '시');

      datasets.push({
        label: `${config.label} (${dateAStr})`,
        data: dataA.map(dataValues),
        backgroundColor: chartType === 'BAR' ? config.color : config.bgColor,
        borderColor: config.color,
        borderWidth: 2,
        fill: chartType === 'LINE',
        tension: 0.3,
      });
      datasets.push({
        label: `${config.label} (${dateBStr})`,
        data: dataB.map(dataValues),
        backgroundColor:
          chartType === 'BAR' ? config.colorCompare : config.colorCompare,
        borderColor: config.colorCompare,
        borderWidth: 2,
        fill: chartType === 'LINE',
        tension: 0.3,
      });
    } else {
      // 범위 모드 (기존 로직 유지)
      labels = apiRawData.map((d) => {
        if (isHourly) {
          const datePart = d.date.substring(5, 10);
          const timePart = d.date.substring(11, 13);
          return `${datePart} ${timePart}시`;
        }
        return d.date.substring(5, 10);
      });
      const data = apiRawData.map(dataValues);

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
            disabled={chartMode === 'COMPARE'} // 비교 모드에서는 기간 preset 비활성화
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
            disabled={chartMode === 'COMPARE'} // 비교 모드에서는 집계 단위 비활성화
          >
            <option value="daily">일별</option>
            <option value="hourly">시간별</option>
          </select>
        </div>
        {/* ⭐️ [수정] 시간 선택 필터 (시간별/비교 모드일 때만 표시) */}
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
              // 비교 모드용 단일 날짜 선택기
              <div className={styles.compareDateGroup}>
                <DatePicker
                  selected={compareDateA}
                  onChange={(date: Date) => setCompareDateA(date)}
                  dateFormat="yyyy-MM-dd"
                  className={styles.datePickerInput}
                />
                <span>~</span>

                <DatePicker
                  selected={compareDateB}
                  onChange={(date: Date) => setCompareDateB(date)}
                  dateFormat="yyyy-MM-dd"
                  className={styles.datePickerInput}
                />
              </div>
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
      {/* 🟢 [유지] AI 분석 멘트 표시 영역 */}
      {aiAnalysisComment && (
        <div className={styles.aiAnalysisBox}>
          <h4>✨ AI 분석 리포트</h4>

          <div
            className={styles.aiAnalysisContent} // 클래스 적용
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
              <LoadingSpinner />
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
          {/* ⭐️ [수정] <table> 태그 바로 다음에 <thead>가 오도록 불필요한 공백 제거 */}
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
