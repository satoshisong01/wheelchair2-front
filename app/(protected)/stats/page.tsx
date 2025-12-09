// app/stats/page.tsx (기간별 필터 제거 및 단위 필터 유지)

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

type MetricType = 'BATTERY' | 'SPEED' | 'DISTANCE';
type TimeUnitType = 'daily' | 'hourly';

const METRIC_CONFIG = {
  BATTERY: {
    label: '평균 배터리 잔량',
    unit: '%',
    color: '#27b4e9',
    bgColor: 'rgba(39, 180, 233, 0.2)',
    yMax: 100,
  },
  SPEED: {
    label: '평균 속도',
    unit: 'm/s',
    color: '#ff9f40',
    bgColor: 'rgba(255, 159, 64, 0.2)',
    yMax: undefined,
  },
  DISTANCE: {
    label: '주행 거리',
    unit: 'm',
    color: '#4bc0c0',
    bgColor: 'rgba(75, 192, 192, 0.2)',
    yMax: undefined,
  },
};

export default function StatsPage() {
  const { data: session, status } = useSession();
  const userRole = session?.user?.role;
  const isManager = userRole === 'ADMIN' || userRole === 'MASTER'; // ⭐️ [수정] periodType 대신 Time Range Preset 설정 용도로 사용

  const [periodType, setPeriodType] = useState<
    'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM'
  >('MONTHLY'); // ⭐️ [유지] 시간 단위 상태
  const [timeUnit, setTimeUnit] = useState<TimeUnitType>('daily');

  const today = new Date();
  const [startDate, setStartDate] = useState<Date>(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [endDate, setEndDate] = useState<Date>(today);

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

  const [mySerial, setMySerial] = useState<string>(''); // 1. 세션 로드 후 기기 사용자 설정 (ID 설정 및 시리얼 조회)

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
  }, [status, isManager, session]); // 2. 관리자용 기기 목록 로딩

  useEffect(() => {
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
  }, [isManager]); // 기간 설정 로직 (PeriodType 변경 시 Start/End Date 자동 설정)

  useEffect(() => {
    const now = new Date();
    let newStart = new Date();
    let newEnd = new Date();

    const setUnit = (unit: TimeUnitType) => setTimeUnit(unit);

    switch (periodType) {
      case 'WEEKLY':
        newStart.setDate(now.getDate() - 7);
        newEnd = now;
        setUnit('daily');
        break;
      case 'MONTHLY':
        newStart = new Date(now.getFullYear(), now.getMonth(), 1);
        newEnd = now;
        setUnit('daily');
        break;
      case 'YEARLY':
        newStart = new Date(now.getFullYear(), 0, 1);
        newEnd = now;
        setUnit('daily');
        break;
      case 'CUSTOM':
        return;
    }
    setStartDate(newStart);
    setEndDate(newEnd);
  }, [periodType]);

  const handleDateChangeStart = (date: Date) => {
    setStartDate(date);
    setPeriodType('CUSTOM');
  };
  const handleDateChangeEnd = (date: Date) => {
    setEndDate(date);
    setPeriodType('CUSTOM');
  }; // 3. 데이터 검색 및 테이블 매핑 (POST 요청)

  const handleSearch = useCallback(async () => {
    if (!isManager && selectedDevice === 'ALL') return;

    setIsLoading(true);
    setAiAnalysisComment(null);
    const startStr = formatDateString(startDate);
    const endStr = formatDateString(endDate);

    try {
      const res = await fetch(`/api/stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: startStr,
          endDate: endStr,
          deviceId: selectedDevice,
          metric: selectedMetric,
          unit: timeUnit,
        }),
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
      }

      setTableData(
        apiData.map((d: any) => ({
          date: timeUnit === 'hourly' ? d.date.substring(5, 16) : d.date, // ⭐️ [수정] 테이블 날짜 포맷
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
    selectedDevice,
    selectedMetric,
    timeUnit,
    devices,
    isManager,
    mySerial,
  ]); // 초기 로딩 (selectedDevice, mySerial, selectedMetric, timeUnit 변경 시 실행)

  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (isInitialLoad && status === 'authenticated') {
      handleSearch();
      setIsInitialLoad(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]); // 세션 인증 상태가 확인되면 한 번 실행

  useEffect(() => {
    if (apiRawData.length === 0) {
      setChartData(null);
      return;
    }

    const labels = apiRawData.map((d) => {
      if (timeUnit === 'hourly') {
        const datePart = d.date.substring(5, 10);
        const timePart = d.date.substring(11, 13);
        return `${datePart} ${timePart}시`;
      }
      return d.date.substring(5, 10); // ⭐️ [수정] 일별은 월-일만 표시
    });
    const config = METRIC_CONFIG[selectedMetric];

    const dataValues = apiRawData.map((d) => {
      if (selectedMetric === 'BATTERY') return d.avgBattery;
      if (selectedMetric === 'SPEED') return d.avgSpeed;
      if (selectedMetric === 'DISTANCE') return d.avgDistance;
      return 0;
    });

    setChartData({
      labels: labels,
      datasets: [
        {
          label: `${config.label} (${config.unit})`,
          data: dataValues,
          backgroundColor: chartType === 'BAR' ? config.color : config.bgColor,
          borderColor: config.color,
          borderWidth: 2,
          fill: chartType === 'LINE',
          tension: 0.3,
        },
      ],
    });
  }, [apiRawData, selectedMetric, chartType, timeUnit]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      title: {
        display: true,
        text: `${METRIC_CONFIG[selectedMetric].label} 변화 추이 (${
          timeUnit === 'hourly' ? '시간별' : '일별'
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
        {/* ⭐️ [수정] 기간별 필터 제거 (UI에서 요청하신 대로) */}
        <div className={styles.filterGroup}>
          <label>단위 선택</label>
          <select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value as any)}
            className={styles.select}
          >
            <option value="WEEKLY">최근 7일</option>
            <option value="MONTHLY">이번 달</option>
            <option value="YEARLY">올해</option>
            <option value="CUSTOM">직접 선택</option>
          </select>
        </div>
        {/* ⭐️ [수정] 단위 필터 재배치 및 라벨 변경 */}
        <div className={styles.filterGroup}>
          <label>집계 단위</label>
          <select
            value={timeUnit}
            onChange={(e) => setTimeUnit(e.target.value as TimeUnitType)}
            className={styles.select}
          >
            <option value="daily">일별</option>
            <option value="hourly">시간별</option>
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>기간 선택</label>
          <div className={styles.datePickerWrapper}>
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChangeStart={handleDateChangeStart}
              onChangeEnd={handleDateChangeEnd}
            />
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
            dangerouslySetInnerHTML={{
              __html: aiAnalysisComment.replace(/\n/g, '<br />'),
            }}
          />
        </div>
      )}
      <div className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <h3>📊 데이터 시각화</h3>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div className={styles.chartToggle}>
              <button
                style={{
                  backgroundColor:
                    selectedMetric === 'BATTERY' ? '#27b4e9' : '#f0f0f0',
                  color: selectedMetric === 'BATTERY' ? 'white' : 'black',
                }}
                onClick={() => setSelectedMetric('BATTERY')}
              >
                배터리
              </button>
              <button
                style={{
                  backgroundColor:
                    selectedMetric === 'SPEED' ? '#ff9f40' : '#f0f0f0',
                  color: selectedMetric === 'SPEED' ? 'white' : 'black',
                }}
                onClick={() => setSelectedMetric('SPEED')}
              >
                속도
              </button>
              <button
                style={{
                  backgroundColor:
                    selectedMetric === 'DISTANCE' ? '#4bc0c0' : '#f0f0f0',
                  color: selectedMetric === 'DISTANCE' ? 'white' : 'black',
                }}
                onClick={() => setSelectedMetric('DISTANCE')}
              >
                주행거리
              </button>
            </div>
            <div
              style={{ width: '1px', height: '24px', background: '#ccc' }}
            ></div>
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center', // ⭐️ [추가] 수평 중앙 정렬 (로딩 스피너는 주로 중앙에 배치됨)
                marginTop: '-200px', // ⭐️ [수정] 음수 margin-top을 사용하여 위로 100px 이동
                height: '100%', // ⭐️ [추가] 부모 높이를 채우도록 설정 (필요시)
              }}
            >
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
          <thead>
            <tr>
              <th>날짜</th> <th>차량명</th>
              <th>배터리 잔량</th> <th>평균 속도</th>
              <th>주행 거리</th>
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
                  <td>{row.date}</td> <td>{row.deviceName}</td>
                  <td>
                    <strong
                      style={{
                        color:
                          selectedMetric === 'BATTERY' ? '#27b4e9' : 'inherit',
                      }}
                    >
                      {row.battery}%
                    </strong>
                  </td>
                  <td>
                    <span
                      style={{
                        fontWeight:
                          selectedMetric === 'SPEED' ? 'bold' : 'normal',
                        color:
                          selectedMetric === 'SPEED' ? '#ff9f40' : 'inherit',
                      }}
                    >
                      {row.speed} m/s
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        fontWeight:
                          selectedMetric === 'DISTANCE' ? 'bold' : 'normal',
                        color:
                          selectedMetric === 'DISTANCE' ? '#4bc0c0' : 'inherit',
                      }}
                    >
                      {row.distance} m
                    </span>
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
