/**
 * scripts/migrate-encrypt-medical-info.js
 * 🔒 [F2/DC-01] medical_info의 기존 평문 행을 암호화(at-rest)하는 일회성 마이그레이션.
 *
 * 설계 원칙 (사용자 무영향):
 *  - 멱등: 이미 암호화된 값(iv:cipher 형식)은 건너뜀 → 재실행해도 안전, 이중암호화 없음.
 *  - lib/crypto.ts와 100% 동일한 키 유도(scrypt) · 알고리즘(aes-256-cbc) · 포맷(ivHex:cipherHex).
 *  - 읽기 경로(decrypt)는 평문 폴백이라, 마이그레이션 전/후 모두 사용자에겐 동일하게 보임.
 *
 * ⚠️ 반드시 "앱(운영)과 동일한 ENCRYPTION_KEY / ENCRYPTION_SALT" 로 실행해야 함.
 *    키가 다르면 앱이 복호화하지 못한다. 아래 --verify가 이를 자동 점검한다.
 *
 * 사용법:
 *    node scripts/migrate-encrypt-medical-info.js            # dry-run(기본, 쓰기 없음) — 현황 카운트만
 *    node scripts/migrate-encrypt-medical-info.js --verify   # 기존 암호문을 현재 키로 복호화 검증(키 일치 확인)
 *    node scripts/migrate-encrypt-medical-info.js --commit    # 실제 암호화 실행(운영 키 필요, --verify 통과 권장)
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { createCipheriv, createDecipheriv, scryptSync, randomBytes } = require('crypto');
require('dotenv').config({ path: '.env.local' });

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const VERIFY = args.includes('--verify');

// ── lib/crypto.ts와 동일한 키/암복호화 (반드시 일치 유지) ─────────────
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const secretKey = process.env.ENCRYPTION_KEY;
if (!secretKey || secretKey.length !== 32) {
  console.error('❌ ENCRYPTION_KEY가 없거나 32글자가 아닙니다. (.env.local 또는 운영 환경변수 확인)');
  process.exit(1);
}
const ENCRYPTION_SALT = process.env.ENCRYPTION_SALT || 'salt';
const key = scryptSync(secretKey, ENCRYPTION_SALT, 32);

function encrypt(text) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let e = cipher.update(text, 'utf8', 'hex');
  e += cipher.final('hex');
  return iv.toString('hex') + ':' + e;
}
function tryDecrypt(data) {
  const parts = String(data).split(':');
  if (parts.length < 2) return { plaintext: true, value: data };
  try {
    const iv = Buffer.from(parts.shift(), 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    let d = decipher.update(parts.join(':'), 'hex', 'utf8');
    d += decipher.final('utf8');
    return { plaintext: false, ok: true, value: d };
  } catch {
    return { plaintext: false, ok: false };
  }
}

// 암호화된 값 판별: 32 hex(IV) + ':' + hex(cipher)
const ENC_RE = /^[0-9a-f]{32}:[0-9a-f]+$/i;
const isEncrypted = (v) => typeof v === 'string' && ENC_RE.test(v);
const needsEnc = (v) => typeof v === 'string' && v.length > 0 && !isEncrypted(v);

// ── DB 연결 (RDS면 CA 검증 강제) ───────────────────────────────────
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('❌ DATABASE_URL이 없습니다.');
  process.exit(1);
}
const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('rds.amazonaws.com')
    ? {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        ca: fs.readFileSync(path.join(__dirname, '..', 'certs', 'rds-global-bundle.pem'), 'utf8'),
      }
    : undefined,
});

const FIELDS = ['disability_grade', 'medical_conditions', 'emergency_contact'];

async function main() {
  console.log(`\n=== medical_info 암호화 마이그레이션 (${COMMIT ? 'COMMIT(쓰기)' : VERIFY ? 'VERIFY' : 'DRY-RUN(읽기전용)'}) ===`);
  if (ENCRYPTION_SALT === 'salt') console.warn('⚠️ ENCRYPTION_SALT가 기본값(salt)입니다. 운영과 동일한지 확인하세요.');

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT user_id, disability_grade, medical_conditions, emergency_contact FROM medical_info`,
    );
    console.log(`총 ${rows.length}개 행 조회됨.`);

    const stat = { encrypted: 0, plaintext: 0, empty: 0 };
    const perField = { disability_grade: 0, medical_conditions: 0, emergency_contact: 0 };
    const toUpdate = []; // { user_id, changes: {field: cipher} }
    let sampleEncrypted = null;

    for (const r of rows) {
      const changes = {};
      for (const f of FIELDS) {
        const v = r[f];
        if (v == null || v === '') { stat.empty++; continue; }
        if (isEncrypted(v)) { stat.encrypted++; if (!sampleEncrypted) sampleEncrypted = v; continue; }
        // 평문 → 암호화 대상
        stat.plaintext++; perField[f]++;
        if (COMMIT) changes[f] = encrypt(v);
      }
      if (Object.keys(changes).length > 0) toUpdate.push({ user_id: r.user_id, changes });
    }

    console.log(`\n[현황] 이미 암호화 ${stat.encrypted} · 평문(대상) ${stat.plaintext} · 빈값 ${stat.empty}`);
    console.log(`[평문 대상 필드별] 장애등급 ${perField.disability_grade} · 특이사항 ${perField.medical_conditions} · 비상연락 ${perField.emergency_contact}`);
    console.log(`[변경 필요 행] ${rows.filter((r) => FIELDS.some((f) => needsEnc(r[f]))).length}개`);

    // 키 일치 검증: 기존 암호문을 현재 키로 복호화 시도
    if (VERIFY || COMMIT) {
      if (!sampleEncrypted) {
        console.log('\n[VERIFY] 기존 암호화된 행이 없어 키 일치 검증 불가. (첫 마이그레이션)');
        console.log('        → 반드시 앱(Vercel/운영)과 동일한 ENCRYPTION_KEY/ENCRYPTION_SALT로 실행하세요.');
        if (COMMIT && !args.includes('--force')) {
          console.error('        ❌ 안전을 위해 중단. 키 일치를 확신하면 --force 를 추가하세요.');
          return;
        }
      } else {
        const dec = tryDecrypt(sampleEncrypted);
        if (dec.plaintext === false && dec.ok) {
          console.log(`\n[VERIFY] ✅ 기존 암호문을 현재 키로 복호화 성공 — 운영 키와 일치. 커밋 안전.`);
        } else {
          console.error(`\n[VERIFY] ❌ 기존 암호문을 현재 키로 복호화 실패 — 로컬 키가 운영 키와 다릅니다!`);
          console.error(`        이 상태로 --commit 하면 앱이 데이터를 못 읽습니다. 운영 키로 다시 실행하세요.`);
          if (COMMIT) return;
        }
      }
    }

    if (!COMMIT) {
      console.log(`\n(dry-run) 실제 변경 없음. 적용하려면 --commit 추가.`);
      return;
    }

    // 실제 커밋 (트랜잭션, 변경 행만)
    console.log(`\n[COMMIT] ${toUpdate.length}개 행 암호화 업데이트 시작...`);
    await client.query('BEGIN');
    let done = 0;
    for (const u of toUpdate) {
      const sets = Object.keys(u.changes).map((f, i) => `${f} = $${i + 2}`).join(', ');
      const vals = Object.values(u.changes);
      await client.query(`UPDATE medical_info SET ${sets} WHERE user_id = $1`, [u.user_id, ...vals]);
      done++;
    }
    await client.query('COMMIT');
    console.log(`✅ 완료: ${done}개 행 암호화. (멱등 — 재실행 시 이미 암호화된 행은 건너뜀)`);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('❌ 마이그레이션 오류:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
