/**
 * RDS 데이터베이스 연결 테스트 스크립트 (Raw SQL 버전)
 */

// 🚨 [FIX] TypeORM 대신 pg를 사용합니다.
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { format } from 'util';
import * as fs from 'fs';

// .env.local 파일 로드 (배포 환경에서는 .env가 읽히도록 설정)
dotenv.config(); // dotenv.config()만 호출하여 .env를 읽게 함 (EC2 환경)

// 🚨 [FIX] TypeORM 대신 pg의 Pool을 사용하도록 로직 수정
async function testConnection() {
  console.log('🔍 Testing RDS database connection...\n');

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set in .env');
    process.exit(1);
  }

  // DATABASE_URL에서 정보 추출 (보안상 비밀번호는 숨김)
  try {
    // URL 생성자가 postgresql://을 http://로 인식하도록 변환
    const url = new URL(databaseUrl.replace('postgresql://', 'http://'));
    console.log('📋 Connection Info:');
    console.log(`   Host: ${url.hostname}`);
    console.log(`   Port: ${url.port}`);
    console.log(`   Database: ${url.pathname.replace('/', '')}`);
    console.log(`   User: ${url.username}`);
    console.log(`   Password: ${'*'.repeat(url.password.length)}`);
    console.log('');
  } catch (e) {
    console.log(`   Connection String: ${databaseUrl.substring(0, 50)}...`);
  }

  // 1. pg Pool 설정
  const testPool = new Pool({
    connectionString: databaseUrl,
    // 🔒 RDS CA 검증 강제 (운영과 동일 조건으로 테스트)
    ssl: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      ca: fs.readFileSync(resolve(__dirname, '..', 'certs', 'rds-global-bundle.pem'), 'utf8'),
    },
    connectionTimeoutMillis: 5000,
  });

  let client;

  try {
    console.log('🔄 Attempting to connect...');
    // 클라이언트 대여 (연결 테스트)
    client = await testPool.connect();

    console.log('✅ Connection successful!');

    // 간단한 쿼리 테스트
    const result = await client.query('SELECT version()');
    console.log(
      `✅ PostgreSQL Version: ${result.rows[0].version.split(',')[0]}`
    );

    // 테이블 목록 확인
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    if (tables.rows.length > 0) {
      console.log(`\n📊 Found ${tables.rows.length} table(s):`);
      tables.rows.forEach((table: any) => {
        console.log(`   - ${table.table_name}`);
      });
    } else {
      console.log('\n📊 No tables found in the database.');
    }

    client.release(); // 클라이언트 반납
    await testPool.end(); // 풀 종료

    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Connection failed:');
    console.error(`   Error: ${error.message}`);

    // 🚨 [핵심 유지] 기존의 에러 코드 디버깅 로직 유지
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      console.error('\n💡 Troubleshooting:');
      console.error('   - Check if RDS instance is running');
      console.error(
        '   - Verify security group allows connections from your IP'
      );
      console.error('   - Check if endpoint address is correct');
    } else if (error.code === '28P01') {
      // 28P01: invalid_password / ClientAuthentication
      console.error('\n💡 Troubleshooting:');
      console.error('   - Check username and password');
    } else if (error.code === '3D000') {
      // 3D000: database_does_not_exist
      console.error('\n💡 Troubleshooting:');
      console.error('   - Database does not exist');
      console.error('   - Check database name in DATABASE_URL');
    }

    if (client) client.release(); // 연결 실패했더라도 안전하게 릴리스 시도
    await testPool.end().catch(() => {});

    process.exit(1);
  }
}

testConnection();


