// 📍 경로: app/(protected)/stats/page.tsx (최종 수정 전체 코드)

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

import styles from './page.module.css';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// ⭐️ [신규 모듈] 모듈화된 컴포넌트 및 타입 import
import StatsFilters from './StatsFilters';
import StatsChartRenderer from './StatsChartRenderer';
import StatsTable from './StatsTable';
import {
  MetricType,
  TimeUnitType,
  ChartModeType,
  AggregatedData,
  formatDateString,
} from './StatsTypes';

// Chart.js 등록 (메인 파일에서 한 번만 등록)
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

// 시간 옵션 배열은 StatsTypes.ts로 이동 (여기서는 삭제)
// METRIC_CONFIG, 타입 정의도 StatsTypes.ts로 이동 (여기서는 삭제)

export default function StatsContent() {
  const { data: session, status } = useSession();
  const userRole = session?.user?.role;
  const isManager = userRole === 'ADMIN' || userRole === 'MASTER';

  // --- 상태 정의 ---
  const [periodType, setPeriodType] = useState<'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM'>(
    'MONTHLY',
  );
  const [timeUnit, setTimeUnit] = useState<TimeUnitType>('daily');
  const [chartMode, setChartMode] = useState<ChartModeType>('RANGE');

  const today = new Date();
  const [startDate, setStartDate] = useState<Date>(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [endDate, setEndDate] = useState<Date>(today);
  const [compareDateA, setCompareDateA] = useState<Date>(
    new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()),
  );
  const [compareDateB, setCompareDateB] = useState<Date>(today);

  const [startHour, setStartHour] = useState<string>('09');
  const [endHour, setEndHour] = useState<string>('18');

  const [selectedDevice, setSelectedDevice] = useState('ALL');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [chartType, setChartType] = useState<'BAR' | 'LINE'>('BAR');
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('BATTERY');

  const [apiRawData, setApiRawData] = useState<AggregatedData[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiAnalysisComment, setAiAnalysisComment] = useState<string | null>(null);
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([
    { id: 'ALL', name: '전체 기기' },
  ]);
  const regions = ['전체 지역', '경기도', '서울시', '인천시'];
  const [mySerial, setMySerial] = useState<string>('');
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // --- useEffect: 인증 및 기기 목록 로딩 ---
  useEffect(() => {
    // 1. 일반 사용자 (비관리자) 처리
    if (status === 'authenticated' && !isManager) {
      const myId = (session?.user as any)?.wheelchairId;
      if (myId) {
        setSelectedDevice(String(myId));
        // 시리얼 번호 조회
        fetch('/api/device-info')
          .then((res) => res.json())
          .then((data) => {
            if (data.serial) setMySerial(data.serial);
          })
          .catch((err) => console.error('시리얼 조회 실패:', err));
      }
    }
    // 2. 관리자용 기기 목록 로딩
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
  }, [status, isManager, session]);

  // --- useEffect: 기간 설정 자동 업데이트 ---
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

    if (chartMode === 'COMPARE') {
      postBody = {
        mode: 'COMPARE',
        compareDates: [formatDateString(compareDateA), formatDateString(compareDateB)],
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

    postBody.metric = selectedMetric;

    try {
      const res = await fetch(`/api/stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody),
      });

      const responseBody = await res.json();

      if (!res.ok) {
        throw new Error(responseBody.message || '통계 데이터를 불러오지 못했습니다.');
      }

      const apiData: AggregatedData[] = responseBody.data;
      const aiComment = responseBody.comment;
      const queryResult = responseBody.query;

      console.log('🤖 [Timestream Query]:', queryResult);

      if (!Array.isArray(apiData) || apiData.length === 0) {
        setApiRawData([]);
        setAiAnalysisComment(aiComment || '데이터가 없습니다.');
        setTableData([]);
        return;
      }

      setApiRawData(apiData);
      setAiAnalysisComment(aiComment);

      const currentDeviceObj = devices.find((d) => d.id === selectedDevice);
      let displayDeviceName = '전체 평균';
      if (selectedDevice !== 'ALL') {
        if (isManager) {
          displayDeviceName = currentDeviceObj ? currentDeviceObj.name : selectedDevice;
        } else {
          displayDeviceName = mySerial ? `내 기기 (${mySerial})` : '내 기기';
        }
      }

      // Table Data 매핑
      setTableData(
        apiData.map((d) => ({
          date: isHourly ? d.date.substring(5, 16) : d.date.substring(5, 10),
          deviceName: displayDeviceName,
          serial: '-',
          battery: d.avgBattery,
          speed: d.avgSpeed,
          distance: d.avgDistance,
        })),
      );
    } catch (error) {
      console.error('데이터 로딩 실패:', error);
      setApiRawData([]);
      setAiAnalysisComment(`데이터 로딩 실패: ${(error as Error).message}`);
      setTableData([]);
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
    startHour,
    endHour,
    devices,
    isManager,
    mySerial,
  ]);

  // --- useEffect: 초기 로딩 시 검색 실행 ---
  useEffect(() => {
    if (isInitialLoad && status === 'authenticated') {
      setTimeout(handleSearch, 100);
      setIsInitialLoad(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isInitialLoad, selectedDevice, mySerial, handleSearch]);

  // --- 렌더링 ---
  if (status === 'loading' || !session?.user || (!isManager && selectedDevice === 'ALL')) {
    return <LoadingSpinner />;
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>통계 정보</h1>

      {/* ⭐️ [모듈] 필터 영역 */}
      <StatsFilters
        periodType={periodType}
        timeUnit={timeUnit}
        chartMode={chartMode}
        startDate={startDate}
        endDate={endDate}
        compareDateA={compareDateA}
        compareDateB={compareDateB}
        startHour={startHour}
        endHour={endHour}
        selectedDevice={selectedDevice}
        selectedRegion={selectedRegion}
        devices={devices}
        regions={regions}
        isManager={isManager}
        isLoading={isLoading}
        setPeriodType={setPeriodType}
        setTimeUnit={setTimeUnit}
        handleDateChangeStart={handleDateChangeStart}
        handleDateChangeEnd={handleDateChangeEnd}
        setCompareDateA={setCompareDateA}
        setCompareDateB={setCompareDateB}
        setStartHour={setStartHour}
        setEndHour={setEndHour}
        setSelectedDevice={setSelectedDevice}
        setSelectedRegion={setSelectedRegion}
        handleSearch={handleSearch}
        handleModeChange={handleModeChange}
      />

      {/* ⭐️ [모듈] AI 분석 및 차트 영역 */}
      <StatsChartRenderer
        apiRawData={apiRawData}
        selectedMetric={selectedMetric}
        chartType={chartType}
        timeUnit={timeUnit}
        chartMode={chartMode}
        compareDateA={compareDateA}
        compareDateB={compareDateB}
        startHour={startHour}
        endHour={endHour}
        isLoading={isLoading}
        aiAnalysisComment={aiAnalysisComment}
        setSelectedMetric={setSelectedMetric}
        setChartType={setChartType}
      />

      {/* ⭐️ [모듈] 테이블 영역 */}
      <StatsTable tableData={tableData} selectedMetric={selectedMetric} isLoading={isLoading} />
    </div>
  );
}
