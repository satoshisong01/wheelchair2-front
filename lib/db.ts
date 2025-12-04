import { Pool } from 'pg';

// 전역 객체에 pool 타입 정의 (TypeScript 에러 방지)
declare global {
  var pool: Pool | undefined;
}

// 1. 커넥션 풀 생성 (싱글톤 패턴)
const pool =
  global.pool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // AWS RDS 연결 시 SSL 설정 (기존 코드 유지)
    ssl: process.env.DATABASE_URL?.includes('rds.amazonaws.com')
      ? { rejectUnauthorized: false }
      : undefined,

    // 🟢 [추가] DB 연결 폭주 및 좀비 방지 설정
    max: 20, // 최대 동시 연결 수 (t3.micro/small 기준 20~50 적당)
    idleTimeoutMillis: 30000, // 30초 이상 안 쓰면 연결 강제 회수 (좀비 방지 핵심!)
    connectionTimeoutMillis: 2000, // 2초 안에 연결 못 하면 에러 뱉고 포기 (무한 로딩 방지)
  });

// 개발 모드에서 재시작 시 커넥션 풀 유지
if (process.env.NODE_ENV !== 'production') {
  global.pool = pool;
}

// 2. 쿼리 실행 헬퍼 함수
export const query = async (text: string, params?: any[]) => {
  // 풀에서 클라이언트를 하나 빌려옵니다. (connect)
  // ⚠️ 중요: pool.query()를 쓰면 내부적으로 connect() -> query() -> release()를 자동으로 해줍니다.
  // 따라서 수동으로 client.release()를 할 필요가 없어 가장 안전합니다.
  try {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    // (선택 사항) 느린 쿼리 모니터링용 로그
    if (duration > 1000) {
      console.warn(`⚠️ [Slow Query] ${duration}ms: ${text}`);
    }

    return res;
  } catch (error) {
    console.error('❌ [DB Error] 쿼리 실행 실패:', error);
    throw error;
  }
};

export default pool;
