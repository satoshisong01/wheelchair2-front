'use client';

import { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

// --- (1) 타입 정의 ---
// 프론트엔드에서 사용할 간단한 타입
interface SimpleWheelchair {
  id: number;
  deviceSerial: string;
  modelName?: string;
}

interface MaintenanceLog {
  id: number;
  reportDate: string; // 날짜는 문자열로 받는 것이 편합니다
  description: string;
  technician: string | null;
  createdAt: string;
}

// --- (2) 메인 컴포넌트 ---
export default function DeviceAdminPage() {
  // --- (3) State 정의 ---
  const [wheelchairs, setWheelchairs] = useState<SimpleWheelchair[]>([]);
  const [selectedWheelchairId, setSelectedWheelchairId] = useState<string>('');

  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 폼(Form) 입력을 위한 State
  const [formDate, setFormDate] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formTechnician, setFormTechnician] = useState<string>('');

  // --- (4) 휠체어 목록 로드 (최초 1회) ---
  useEffect(() => {
    const fetchWheelchairs = async () => {
      try {
        const res = await fetch('/api/wheelchairs');
        if (!res.ok) throw new Error('Failed to fetch wheelchairs');
        const data: SimpleWheelchair[] = await res.json();
        setWheelchairs(data);
        // 첫 번째 휠체어를 자동으로 선택
        if (data.length > 0) {
          setSelectedWheelchairId(String(data[0].id));
        }
      } catch (err: any) {
        setError(err.message);
      }
    };
    fetchWheelchairs();
  }, []);

  // --- (5) 정비 이력 로드 (휠체어 ID 변경 시) ---
  useEffect(() => {
    if (!selectedWheelchairId) {
      setLogs([]); // ID가 없으면 로그 비우기
      return;
    }

    const fetchLogs = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/maintenance/${selectedWheelchairId}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to fetch maintenance logs');
        }
        const data: MaintenanceLog[] = await res.json();
        setLogs(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, [selectedWheelchairId]); // selectedWheelchairId가 바뀔 때마다 실행

  // --- (6) 새 정비 이력 제출 핸들러 ---
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedWheelchairId || !formDate || !formDescription) {
      setError('날짜와 정비 내역은 필수입니다.');
      return;
    }

    try {
      const res = await fetch(`/api/maintenance/${selectedWheelchairId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reportDate: formDate,
          description: formDescription,
          technician: formTechnician || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create log');
      }

      const newLog: MaintenanceLog = await res.json();

      // 상태 업데이트: 새 로그를 맨 위에 추가
      setLogs([newLog, ...logs]);

      // 폼 초기화
      setFormDate('');
      setFormDescription('');
      setFormTechnician('');
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // --- (7) JSX 렌더링 ---
  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
        기기 정비 이력 관리
      </h1>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <hr style={{ margin: '1rem 0' }} />

      {/* --- 휠체어 선택 드롭다운 --- */}
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="wheelchair-select" style={{ marginRight: '0.5rem' }}>
          휠체어 선택:
        </label>
        <select
          id="wheelchair-select"
          value={selectedWheelchairId}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            setSelectedWheelchairId(e.target.value)
          }
          style={{ padding: '0.5rem', minWidth: '200px' }}
        >
          <option value="">-- 휠체어를 선택하세요 --</option>
          {wheelchairs.map((wc) => (
            <option key={wc.id} value={wc.id}>
              {wc.deviceSerial} (ID: {wc.id})
              {wc.modelName ? `- ${wc.modelName}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* --- 새 정비 이력 추가 폼 --- */}
      <form
        onSubmit={handleSubmit}
        style={{ background: '#f4f4f4', padding: '1rem', borderRadius: '8px' }}
      >
        <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
          새 정비 이력 추가
        </h2>
        <div style={{ margin: '0.5rem 0' }}>
          <label>정비 날짜: </label>
          <input
            type="date"
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
            style={{ padding: '0.25rem' }}
          />
        </div>
        <div style={{ margin: '0.5rem 0' }}>
          <label>정비 내역: </label>
          <input
            type="text"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="예: 좌측 모터 교체"
            style={{ padding: '0.25rem', width: '300px' }}
          />
        </div>
        <div style={{ margin: '0.5rem 0' }}>
          <label>정비 담당자: </label>
          <input
            type="text"
            value={formTechnician}
            onChange={(e) => setFormTechnician(e.target.value)}
            placeholder="예: 홍길동"
            style={{ padding: '0.25rem' }}
          />
        </div>
        <button
          type="submit"
          style={{
            padding: '0.5rem 1rem',
            background: 'blue',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
          }}
        >
          이력 저장
        </button>
      </form>

      <hr style={{ margin: '1rem 0' }} />

      {/* --- 정비 이력 목록 --- */}
      <div>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
          정비 이력 (최신순)
        </h2>
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {logs.length === 0 ? (
              <p>정비 이력이 없습니다.</p>
            ) : (
              logs.map((log) => (
                <li
                  key={log.id}
                  style={{
                    border: '1px solid #ddd',
                    padding: '0.5rem',
                    marginBottom: '0.5rem',
                    borderRadius: '4px',
                  }}
                >
                  <p>
                    <strong>날짜:</strong>
                    {new Date(log.reportDate).toLocaleDateString()}
                  </p>
                  <p>
                    <strong>내역:</strong> {log.description}
                  </p>
                  <p>
                    <strong>담당자:</strong> {log.technician || 'N/A'}
                  </p>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
