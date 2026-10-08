import { Pool, PoolConfig } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { logServerError } from '@/lib/server-log';

// 전역 객체에 pool 타입 정의 (TypeScript 에러 방지)
declare global {
  var pool: Pool | undefined;
}

/**
 * 🔒 [보안] DB SSL 옵션 공통 헬퍼
 * - 로컬 DB(localhost)가 아니면 호스트 이름과 관계없이 항상 TLS 1.2 이상 + 인증서 검증
 *   (예전엔 'rds.amazonaws.com' 문자열로 판별 → 사용자 지정 DNS를 쓰면 평문 연결될 수 있었음)
 * - CA 우선순위: DATABASE_CA_CERT(PEM 문자열) > DATABASE_CA_PATH(파일) > certs/rds-global-bundle.pem(저장소 포함)
 * - CA를 못 찾으면 검증 없이 붙지 않고 오류로 멈춘다 (예전의 '검증 완화' 폴백 제거).
 *   운영 env DATABASE_SSL_REJECT_UNAUTHORIZED=true 동작이 기본이 되어 이 env는 더 이상 읽지 않음
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
// URL에 이 파라미터가 있으면 pg가 아래 ssl 설정을 통째로 덮어씀 (sslmode=no-verify면 검증이 꺼짐)
const URL_TLS_PARAMS = /[?&](sslmode|ssl|sslrootcert|sslcert|sslkey)=/i;

let _sslLogged = false;

function isDbTlsRequired(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  try {
    return !LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return true; // 주소를 해석하지 못하면 안전하게 TLS 필수로 본다
  }
}

function loadDbCa(): { pem: string; source: string } | undefined {
  const caPem = process.env.DATABASE_CA_CERT;
  if (caPem && caPem.includes('BEGIN CERTIFICATE')) {
    return { pem: caPem, source: 'env:DATABASE_CA_CERT' };
  }
  const caPath =
    process.env.DATABASE_CA_PATH || path.join(process.cwd(), 'certs', 'rds-global-bundle.pem');
  try {
    const pem = fs.readFileSync(caPath, 'utf8');
    // source에 파일 경로는 넣지 않음 (진단 API 응답으로 서버 경로가 노출되던 문제)
    return pem.includes('BEGIN CERTIFICATE') ? { pem, source: 'file' } : undefined;
  } catch {
    return undefined;
  }
}

export function getDbSslOption(): PoolConfig['ssl'] {
  if (!isDbTlsRequired()) return undefined;

  const ca = loadDbCa();
  if (!ca) {
    throw new Error(
      '[db] DB 인증서 검증용 CA를 찾지 못해 DB에 연결하지 않습니다 — certs/rds-global-bundle.pem 배포 여부 또는 DATABASE_CA_PATH·DATABASE_CA_CERT를 확인하세요.',
    );
  }

  if (!_sslLogged) {
    console.log('[db] ✅ RDS CA 로드 — DB TLS 인증서 검증 활성화');
    if (URL_TLS_PARAMS.test(process.env.DATABASE_URL ?? '')) {
      console.warn(
        '[db] ⚠️ [SECURITY] DATABASE_URL에 sslmode 등 TLS 파라미터가 있어 인증서 검증 설정이 덮어써집니다 — URL에서 제거하세요.',
      );
    }
    _sslLogged = true;
  }
  return { rejectUnauthorized: true, minVersion: 'TLSv1.2', ca: ca.pem } as PoolConfig['ssl'];
}

/**
 * 🔎 [진단] 현재 DB TLS 검증 상태 (부작용 없음) — 확인용 엔드포인트에서 사용
 */
export function getDbTlsStatus() {
  const url = process.env.DATABASE_URL ?? '';
  const tlsRequired = isDbTlsRequired();
  const ca = tlsRequired ? loadDbCa() : undefined;
  const urlOverridesTls = URL_TLS_PARAMS.test(url);
  const verifying = tlsRequired && !!ca && !urlOverridesTls;
  return {
    isRds: url.includes('rds.amazonaws.com'),
    strictRequested: tlsRequired, // TLS를 쓰면 항상 검증 요청 (완화 설정 없음)
    caFound: !!ca,
    caSource: ca?.source ?? 'none',
    urlOverridesTls,
    verifying,
    mode: !tlsRequired
      ? 'no-ssl'
      : verifying
        ? 'verify (검증 활성 ✅)'
        : ca
          ? 'url-override (URL 파라미터가 검증 설정을 덮어씀 ⚠️)'
          : 'blocked (CA 없음 — 연결 차단 ⛔)',
  };
}

// 1. 커넥션 풀 생성 (싱글톤 패턴)
function createPool(): Pool {
  const newPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: getDbSslOption(),

    // 🟢 [추가] DB 연결 폭주 및 좀비 방지 설정
    max: 10, // RDS max_connections 79를 알람 워커·Vercel과 공유 → PM2 2프로세스 × 10 = 20개로 제한
    idleTimeoutMillis: 30000, // 30초 이상 안 쓰면 연결 강제 회수 (좀비 방지 핵심!)
    connectionTimeoutMillis: 5000, // 모든 라우트가 이 풀 하나를 공유 → 바로 실패하지 않고 5초까지 빈 연결 대기
  });
  // 🔒 유휴 연결 오류(RDS 재시작·네트워크 끊김)에 리스너가 없으면 프로세스가 종료됨
  //    → 오류 요약만 기록하고, 끊긴 연결은 풀이 버리고 다음 요청 때 새로 연결
  newPool.on('error', (error) => logServerError('DB idle client error', error));
  return newPool;
}

const pool = global.pool || createPool();

// 개발 모드에서 재시작 시 커넥션 풀 유지
if (process.env.NODE_ENV !== 'production') {
  global.pool = pool;
}

// 2. 쿼리 실행 헬퍼 함수
export const query = async (text: string, params?: unknown[]) => {
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
    // 쿼리 원문·바인딩 값·pg 상세(detail 등)는 남기지 않고 이름·코드·짧은 메시지만 기록
    logServerError('DB query failed', error);
    throw error;
  }
};

export default pool;
