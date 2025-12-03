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

// 헬퍼 함수: 날짜를 YYYY-MM-DD 문자열로 변환
const formatDateString = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function StatsPage() {
  // --- 1. 필터 상태 관리 ---
  const { data: session } = useSession();
  const userRole = session?.user?.role;
  const isManager = userRole === 'ADMIN' || userRole === 'MASTER';
  const [periodType, setPeriodType] = useState<
    'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM'
  >('MONTHLY');

  const today = new Date();
  const [startDate, setStartDate] = useState<Date>(
    new Date(today.getFullYear(), today.getMonth(), 1)
  ); // 이달 1일
  const [endDate, setEndDate] = useState<Date>(today); // 오늘

  const [selectedDevice, setSelectedDevice] = useState('ALL');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [chartType, setChartType] = useState<'BAR' | 'LINE'>('BAR');

  // --- 2. 데이터 상태 ---
  const [chartData, setChartData] = useState<any>(null);
  const [tableData, setTableData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // (추후 API로 대체 가능) 임시 기기 목록
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([
    { id: 'ALL', name: '전체 기기' },
  ]);
  const regions = ['전체 지역', '경기도', '서울시', '인천시'];

  // 🟢 [추가] 실제 기기 목록 불러오기 (관리자일 경우만)
  useEffect(() => {
    const fetchDevices = async () => {
      if (!isManager) return;

      try {
        const res = await fetch('/api/wheelchairs');
        if (res.ok) {
          const data = await res.json();
          const realDevices = data.map((d: any) => ({
            id: d.device_serial || String(d.id),
            name: d.device_serial || `기기 ${d.id}`,
          }));
          setDevices([{ id: 'ALL', name: '전체 기기' }, ...realDevices]);
        }
      } catch (error) {
        console.error('기기 목록 로딩 실패:', error);
      }
    };

    fetchDevices();
  }, [isManager]);

  // 🟢 [로직 1] 기간 타입 변경 시 날짜 자동 계산
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

  // 핸들러: 달력 직접 변경 시 CUSTOM 모드로 전환
  const handleDateChangeStart = (date: Date) => {
    setStartDate(date);
    setPeriodType('CUSTOM');
  };
  const handleDateChangeEnd = (date: Date) => {
    setEndDate(date);
    setPeriodType('CUSTOM');
  };

  // --- 3. 데이터 검색 핸들러 (실제 API 연동) ---
  const handleSearch = useCallback(async () => {
    setIsLoading(true);

    const startStr = formatDateString(startDate);
    const endStr = formatDateString(endDate);

    console.log('검색 조건:', {
      periodType,
      startStr,
      endStr,
      selectedDevice,
      selectedRegion,
    });

    try {
      // 🟢 [수정됨] 실제 API 호출
      const res = await fetch(
        `/api/stats?startDate=${startStr}&endDate=${endStr}&deviceId=${selectedDevice}`
      );

      if (!res.ok) {
        const errorBody = await res.json();
        throw new Error(
          errorBody.message || '통계 데이터를 불러오지 못했습니다.'
        );
      }

      const apiData = await res.json(); // [{ date: '...', avgBattery: 80, count: 10 }, ...]

      // 데이터가 없을 경우 처리
      if (!Array.isArray(apiData) || apiData.length === 0) {
        setChartData(null);
        setTableData([]);
        return; // finally 블록으로 이동
      }

      // API 데이터를 차트용 배열로 변환
      const labels = apiData.map((d: any) => d.date);
      const values = apiData.map((d: any) => d.avgBattery);

      setChartData({
        labels: labels,
        datasets: [
          {
            label: '평균 배터리 잔량 (%)',
            data: values,
            backgroundColor:
              chartType === 'BAR' ? '#27b4e9' : 'rgba(39, 180, 233, 0.2)',
            borderColor: '#27b4e9',
            borderWidth: 1,
            fill: chartType === 'LINE',
            tension: 0.4,
          },
        ],
      });

      // 테이블 데이터 매핑
      setTableData(
        apiData.map((d: any) => ({
          date: d.date,
          deviceName:
            selectedDevice === 'ALL' ? '전체 평균' : `기기 ${selectedDevice}`,
          serial: '-', // (통계 쿼리 특성상 개별 시리얼은 알기 어려움)
          usage: 100 - d.avgBattery, // 예시: 100 - 잔량 = 사용량
          remain: d.avgBattery,
        }))
      );
    } catch (error) {
      console.error('데이터 로딩 실패:', error);
      setChartData(null);
      setTableData([]);
    } finally {
      setIsLoading(false);
    }
  }, [
    startDate,
    endDate,
    periodType,
    selectedDevice,
    selectedRegion,
    chartType,
  ]);

  // 🟢 [로직 2] 초기 로딩 시 한 번만 실행
  useEffect(() => {
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 4. 차트 옵션 ---
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: '배터리/주행 통계' },
      tooltip: {
        enabled: true,
        mode: 'index' as const,
        intersect: false,
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: 10,
        cornerRadius: 4,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100, // 배터리는 100%가 최대이므로 고정하면 보기 좋음
        grid: { color: '#e0e0e0', borderDash: [5, 5] },
      },
      x: {
        grid: { display: false },
      },
    },
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>통계 정보</h1>

      {/* 1. 필터 컨트롤 영역 */}
      <div className={styles.filterBox}>
        <div className={styles.filterGroup}>
          <label>기간별</label>
          <select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value as any)}
            className={styles.select}
          >
            <option value="WEEKLY">주간 (최근 7일)</option>
            <option value="MONTHLY">월간 (이번 달)</option>
            <option value="YEARLY">연간 (올해)</option>
            <option value="CUSTOM">직접 선택</option>
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

        {/* 관리자일 때만 기기 선택 가능 */}
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

      {/* 2. 차트 영역 */}
      <div className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <h3>📊 데이터 시각화</h3>
          <div className={styles.chartToggle}>
            <button
              className={chartType === 'BAR' ? styles.activeType : ''}
              onClick={() => setChartType('BAR')}
            >
              막대그래프
            </button>
            <button
              className={chartType === 'LINE' ? styles.activeType : ''}
              onClick={() => setChartType('LINE')}
            >
              꺾은선그래프
            </button>
          </div>
        </div>

        <div className={styles.canvasWrapper}>
          {isLoading ? (
            <LoadingSpinner />
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

      {/* 3. 하단 테이블 영역 */}
      <div className={styles.tableContainer}>
        <h3 className={styles.tableTitle}>상세 데이터 로그</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>날짜</th>
              <th>차량명</th>
              <th>시리얼 번호</th>
              <th>사용량 / 주행거리</th>
              <th>상태 / 잔량</th>
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
                  <td>{row.serial}</td>
                  <td>{row.usage} %</td>
                  <td>{row.remain} %</td>
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
