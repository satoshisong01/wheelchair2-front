/**
 * AWS SDK 설정
 * Amazon Timestream 사용을 위한 클라이언트
 */
import {
  WriteRecordsCommand,
  _Record,
  // 🚨 [FIX] 문제의 'QueryClient' 임포트 라인을 제거했습니다.
  TimestreamWriteClient,
} from '@aws-sdk/client-timestream-write';

// 🚨 [FIX] 만약 쿼리 클라이언트가 이 파일에서 필요하다면 이 줄을 추가합니다.
import { TimestreamQueryClient } from '@aws-sdk/client-timestream-query';

// AWS 리전 설정
const region = process.env.AWS_REGION || 'ap-northeast-2';
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
};

/**
 * Timestream Write 클라이언트 (데이터 쓰기용)
 */
export const timestreamWriteClient = new TimestreamWriteClient({
  region,
  credentials,
});

/**
 * Timestream Query 클라이언트 (데이터 조회용)
 */
export const timestreamQueryClient = new TimestreamQueryClient({
  region,
  credentials,
});

/**
 * Timestream 데이터베이스 및 테이블 이름
 */
export const TIMESTREAM_DATABASE =
  process.env.TIMESTREAM_DATABASE_NAME || 'wheelchair_timestream';
export const TIMESTREAM_TABLE =
  process.env.TIMESTREAM_TABLE_NAME || 'wheelchair_data';

/**
 * 휠체어 데이터를 Timestream에 배치 쓰기
 * 비용 절감을 위해 배치로 묶어서 전송
 */
export const batchWriteToTimestream = async (records: any[]) => {
  try {
    // TODO: Timestream 배치 쓰기 로직 구현
    // 1초간 데이터를 모으고 배치로 전송
    console.log(`📊 Writing ${records.length} records to Timestream`);
    // 실제 구현은 TimestreamWrite 클라이언트 사용
  } catch (error) {
    console.error('❌ Timestream write error:', error);
    throw error;
  }
};

/**
 * Timestream에서 통계 데이터 조회
 */
export const queryStatistics = async (
  deviceId: string,
  startTime: Date,
  endTime: Date
) => {
  try {
    // TODO: Timestream SQL 쿼리 구현
    const query = `
      SELECT * FROM "${TIMESTREAM_DATABASE}"."${TIMESTREAM_TABLE}"
      WHERE device_id = '${deviceId}'
      AND time BETWEEN '${startTime.toISOString()}' AND '${endTime.toISOString()}'
    `;
    console.log('📊 Querying statistics:', query);
    // 실제 구현은 TimestreamQuery 클라이언트 사용
  } catch (error) {
    console.error('❌ Timestream query error:', error);
    throw error;
  }
};
