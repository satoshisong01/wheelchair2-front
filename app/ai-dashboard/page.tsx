// app/ai-dashboard/page.tsx

'use client';
import { useState } from 'react';

export default function AiDashboard() {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // 예시 질문들
  const examples = [
    '01222611455 기기의 어제 시간대별(1시간 단위) 평균 배터리 잔량을 보여줘',
    '지난달에 주행 거리가 가장 길었던 날은 언제야?',
    '최근 7일간 평균 속도가 가장 빨랐던 시간대는?',
  ];

  const handleSearch = async (q: string) => {
    if (!q) return;
    setLoading(true);
    setQuestion(q);
    try {
      const res = await fetch('/api/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      alert('에러 발생');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
      <h1
        style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}
      >
        🤖 AI 휠체어 데이터 분석관
      </h1>

      {/* 질문 입력창 */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="데이터에 대해 궁금한 점을 물어보세요..."
          style={{
            flex: 1,
            padding: '15px',
            border: '1px solid #ddd',
            borderRadius: '8px',
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch(question)}
        />
        <button
          onClick={() => handleSearch(question)}
          disabled={loading}
          style={{
            padding: '0 30px',
            background: '#0070f3',
            color: 'white',
            borderRadius: '8px',
            border: 'none',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? '분석 중...' : '분석하기'}
        </button>
      </div>

      {/* 추천 질문 */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '40px',
          flexWrap: 'wrap',
        }}
      >
        {examples.map((ex, i) => (
          <button
            key={i}
            onClick={() => handleSearch(ex)}
            style={{
              padding: '8px 12px',
              background: '#f0f0f0',
              border: 'none',
              borderRadius: '20px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            {ex}
          </button>
        ))}
      </div>

      {/* 결과 화면 */}
      {result && (
        <div
          style={{
            border: '1px solid #eee',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          }}
        >
          {/* 서버 안내 문구(차단 사유·오류 등). 생성 SQL은 보안상 응답에 싣지 않으므로 표시하지 않음 */}
          {result.message && (
            <p style={{ color: '#b45309', fontSize: '14px', marginBottom: '10px' }}>
              {String(result.message)}
            </p>
          )}

          {/* ★ [수정 1] 데이터 개수 표시 부분 안전 처리 (? 추가) */}
          <h3
            style={{ color: '#666', fontSize: '14px', margin: '20px 0 10px' }}
          >
            조회 결과 ({result?.data?.length || 0}건):
          </h3>

          <div style={{ maxHeight: '400px', overflow: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '14px',
              }}
            >
              <thead>
                <tr style={{ background: '#f9f9f9', textAlign: 'left' }}>
                  {/* 데이터 키값으로 헤더 생성 */}
                  {result?.data &&
                    result.data.length > 0 &&
                    Object.keys(result.data[0]).map((key) => (
                      <th
                        key={key}
                        style={{
                          padding: '12px',
                          borderBottom: '2px solid #eee',
                        }}
                      >
                        {key}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {/* ★ [수정 2] 데이터 매핑 부분 안전 처리 (&& 추가) */}
                {result?.data &&
                  result.data.map((row: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                      {Object.values(row).map((val: any, j: number) => (
                        <td key={j} style={{ padding: '12px' }}>
                          {String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}

                {/* 데이터가 없을 경우 표시 */}
                {(!result?.data || result.data.length === 0) && (
                  <tr>
                    <td
                      style={{
                        padding: '20px',
                        textAlign: 'center',
                        color: '#999',
                      }}
                    >
                      결과 데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
