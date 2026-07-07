const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// 🔒 [안전장치] 화이트리스트 방식 — development/test가 명시된 경우에만 실행 허용
//   (NODE_ENV 미설정 포함 그 외 전부 차단. 로컬 실행 시: NODE_ENV=development node reset-db.js)
const ALLOWED_ENVS = ['development', 'test'];
if (!ALLOWED_ENVS.includes(process.env.NODE_ENV ?? '')) {
  console.error(
    `[SAFETY] reset-db.js는 NODE_ENV가 development/test일 때만 실행됩니다. (현재: '${process.env.NODE_ENV ?? '미설정'}' — DROP SCHEMA 차단)`,
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // 🔒 RDS 연결 시 CA 검증 강제 (CA 파일이 없으면 즉시 실패 — 개발 스크립트라 폴백 불필요)
  ssl: process.env.DATABASE_URL?.includes('rds.amazonaws.com')
    ? {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        ca: fs.readFileSync(path.join(__dirname, 'certs', 'rds-global-bundle.pem'), 'utf8'),
      }
    : undefined,
});

async function resetDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔥 DB 초기화 시작 (기존 테이블 삭제 중...)');

    // 1. 기존 스키마 통째로 날리고 다시 생성 (가장 확실한 방법)
    await client.query('DROP SCHEMA public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    await client.query('GRANT ALL ON SCHEMA public TO postgres;');
    await client.query('GRANT ALL ON SCHEMA public TO public;');

    console.log('✅ 기존 테이블 삭제 완료. 새 테이블 생성 시작...');

    // 2. Users 테이블 (수정완료: kakao_id 추가, email 필수 해제)
    await client.query(`
        CREATE TABLE users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          kakao_id VARCHAR(255) UNIQUE,
          email VARCHAR(255),
          name VARCHAR(255),
          image TEXT,
          role VARCHAR(50) DEFAULT 'USER',
          location1 VARCHAR(100),
          location2 VARCHAR(100),
          organization VARCHAR(100), -- [추가] 소속
          phone_number VARCHAR(50),  -- [추가] 전화번호
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
    // 3. Wheelchairs 테이블 (휠체어 정보)
    await client.query(`
      CREATE TABLE wheelchairs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        device_serial VARCHAR(255) UNIQUE NOT NULL, -- 시리얼 번호
        model_name VARCHAR(255),
        purchase_date TIMESTAMP,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 4. User-Wheelchair 연결 테이블 (N:M 관계)
    await client.query(`
      CREATE TABLE user_wheelchairs (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        wheelchair_id UUID REFERENCES wheelchairs(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, wheelchair_id)
      );
    `);

    // 6. DeviceAuth 테이블 (기기 로그인용 - 1:1)
    await client.query(`
      CREATE TABLE device_auths (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        device_id VARCHAR(255) UNIQUE NOT NULL, -- MQTT ID 등
        password VARCHAR(255) NOT NULL,         -- 기기 비밀번호
        wheelchair_id UUID UNIQUE REFERENCES wheelchairs(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 7. Alarms 테이블 (알람 이력)
    await client.query(`
      CREATE TABLE alarms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wheelchair_id UUID REFERENCES wheelchairs(id) ON DELETE CASCADE,
        type VARCHAR(50),    -- BATTERY, FALL_DOWN, etc.
        message TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('🎉 모든 테이블 생성 완료! (TypeORM 구조 복원됨)');

  } catch (err) {
    console.error('❌ DB 초기화 실패:', err);
  } finally {
    client.release();
    pool.end();
  }
}

resetDatabase();