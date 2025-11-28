import { Pool } from 'pg';

// 전역 객체에 pool 타입 정의 (TypeScript 에러 방지)
declare global {
  var pool: Pool | undefined;
}

// 1. 커넥션 풀 생성 (싱글톤 패턴)
// 개발 중 재시작될 때마다 연결이 늘어나는 것을 방지합니다.
const pool = global.pool || new Pool({
  connectionString: process.env.DATABASE_URL,
  // AWS RDS 연결 시 SSL 설정 (기존 코드의 로직 유지)
  ssl: process.env.DATABASE_URL?.includes('rds.amazonaws.com') 
    ? { rejectUnauthorized: false } 
    : undefined,
});

if (process.env.NODE_ENV !== 'production') {
  global.pool = pool;
}

// 2. 쿼리 실행 헬퍼 함수
// 이제 어디서든 import { query } from '@/lib/db' 하고 쓰면 됩니다.
export const query = async (text: string, params?: any[]) => {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    console.error('❌ [DB Error] 쿼리 실행 실패:', error);
    throw error;
  }
};

export default pool;