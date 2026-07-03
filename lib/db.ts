import { Pool, PoolConfig } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// 전역 객체에 pool 타입 정의 (TypeScript 에러 방지)
declare global {
  var pool: Pool | undefined;
}

/**
 * 🔒 [보안] DB SSL 옵션 공통 헬퍼
 * - RDS 사용 시 SSL 적용 (TLS 1.2 이상)
 * - DATABASE_SSL_REJECT_UNAUTHORIZED=true 환경변수로 인증서 검증 강제 가능
 * - 기본값은 호환성 유지(false). KTC 평가 시 .env에 true 설정 권장
 * - 신규/마이그레이션 환경에서는 RDS CA 인증서 등록 후 true로 전환 권장
 */
let _sslLogged = false;

export function getDbSslOption(): PoolConfig['ssl'] {
  const isRds = process.env.DATABASE_URL?.includes('rds.amazonaws.com');
  if (!isRds) return undefined;

  const strictMode = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true';
  // 기본값(strict=false)은 현행 동작 그대로 유지 → 배포해도 안 깨짐.
  if (!strictMode) {
    return { rejectUnauthorized: false, minVersion: 'TLSv1.2' } as PoolConfig['ssl'];
  }

  // 🔒 strict 요청됨 → Amazon RDS CA 번들 확보 시도.
  //   우선순위: DATABASE_CA_CERT(PEM 문자열) > DATABASE_CA_PATH(파일) > certs/rds-global-bundle.pem
  let ca: string | undefined;
  try {
    const caPem = process.env.DATABASE_CA_CERT;
    const caPath =
      process.env.DATABASE_CA_PATH ||
      path.join(process.cwd(), 'certs', 'rds-global-bundle.pem');
    if (caPem && caPem.includes('BEGIN CERTIFICATE')) {
      ca = caPem;
    } else if (fs.existsSync(caPath)) {
      ca = fs.readFileSync(caPath, 'utf8');
    }
  } catch {
    /* 아래에서 폴백 처리 */
  }

  if (ca) {
    if (!_sslLogged) {
      console.log('[db] ✅ RDS CA 로드 — DB TLS 인증서 검증 활성화');
      _sslLogged = true;
    }
    return { rejectUnauthorized: true, minVersion: 'TLSv1.2', ca } as PoolConfig['ssl'];
  }

  // ⚠️ strict 요청됐으나 CA 미확보 → 운영 DB 끊김 방지 위해 검증 완화로 폴백(경고)
  if (!_sslLogged) {
    console.warn(
      '[db] ⚠️ DATABASE_SSL_REJECT_UNAUTHORIZED=true 이나 CA 번들 미확보 → 검증 완화(false) 폴백. certs/rds-global-bundle.pem 포함 또는 DATABASE_CA_CERT 설정 확인',
    );
    _sslLogged = true;
  }
  return { rejectUnauthorized: false, minVersion: 'TLSv1.2' } as PoolConfig['ssl'];
}

/**
 * 🔎 [진단] 현재 DB TLS 검증 상태 (부작용 없음) — 확인용 엔드포인트에서 사용
 */
export function getDbTlsStatus() {
  const isRds = !!process.env.DATABASE_URL?.includes('rds.amazonaws.com');
  const strictRequested = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true';
  let caFound = false;
  let caSource = 'none';
  if (isRds && strictRequested) {
    try {
      const caPem = process.env.DATABASE_CA_CERT;
      const caPath =
        process.env.DATABASE_CA_PATH ||
        path.join(process.cwd(), 'certs', 'rds-global-bundle.pem');
      if (caPem && caPem.includes('BEGIN CERTIFICATE')) {
        caFound = true;
        caSource = 'env:DATABASE_CA_CERT';
      } else if (fs.existsSync(caPath)) {
        caFound = true;
        caSource = `file:${caPath}`;
      }
    } catch {
      /* ignore */
    }
  }
  const verifying = isRds && strictRequested && caFound;
  return {
    isRds,
    strictRequested,
    caFound,
    caSource,
    verifying,
    mode: !isRds ? 'no-ssl' : verifying ? 'verify (검증 활성 ✅)' : 'relaxed (검증 완화 ⚠️)',
  };
}

// 1. 커넥션 풀 생성 (싱글톤 패턴)
const pool =
  global.pool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: getDbSslOption(),

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
