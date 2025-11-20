/**
 * RDS 데이터베이스 연결 테스트 스크립트
 */

import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// .env.local 파일 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

async function testConnection() {
  console.log('🔍 Testing RDS database connection...\n');

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set in .env.local');
    process.exit(1);
  }

  // DATABASE_URL에서 정보 추출 (보안상 비밀번호는 숨김)
  try {
    const url = new URL(databaseUrl.replace('postgresql://', 'http://'));
    console.log('📋 Connection Info:');
    console.log(`   Host: ${url.hostname}`);
    console.log(`   Port: ${url.port}`);
    console.log(`   Database: ${url.pathname.replace('/', '')}`);
    console.log(`   User: ${url.username}`);
    console.log(`   Password: ${'*'.repeat(url.password.length)}`);
    console.log('');
  } catch (e) {
    console.log(`   Connection String: ${databaseUrl.substring(0, 50)}...`);
  }

  // 간단한 연결 테스트 (엔티티 없이)
  const testDataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    connectTimeoutMS: 5000,
    logging: ['error'],
  });

  try {
    console.log('🔄 Attempting to connect...');
    await testDataSource.initialize();
    console.log('✅ Connection successful!');

    // 간단한 쿼리 테스트
    const result = await testDataSource.query('SELECT version()');
    console.log(`✅ PostgreSQL Version: ${result[0].version.split(',')[0]}`);

    // 테이블 목록 확인
    const tables = await testDataSource.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    if (tables.length > 0) {
      console.log(`\n📊 Found ${tables.length} table(s):`);
      tables.forEach((table: any) => {
        console.log(`   - ${table.table_name}`);
      });
    } else {
      console.log('\n📊 No tables found in the database.');
    }

    await testDataSource.destroy();
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Connection failed:');
    console.error(`   Error: ${error.message}`);

    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      console.error('\n💡 Troubleshooting:');
      console.error('   - Check if RDS instance is running');
      console.error(
        '   - Verify security group allows connections from your IP'
      );
      console.error('   - Check if endpoint address is correct');
    } else if (error.code === '28P01') {
      console.error('\n💡 Troubleshooting:');
      console.error('   - Check username and password');
    } else if (error.code === '3D000') {
      console.error('\n💡 Troubleshooting:');
      console.error('   - Database does not exist');
      console.error('   - Check database name in DATABASE_URL');
    }

    await testDataSource.destroy().catch(() => {});
    process.exit(1);
  }
}

testConnection();

