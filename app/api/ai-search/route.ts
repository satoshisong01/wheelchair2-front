// app/api/ai-search/route.ts (안전성 강화)

import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { TimestreamQueryClient, QueryCommand } from '@aws-sdk/client-timestream-query';

// [LOG 1] 파일 시작
console.log('--- [START] AI Dashboard API Route Load (Full Logic) ---');

// 1. Timestream 설정 (AWS 키 로드)
const queryClient = new TimestreamQueryClient({
  region: process.env.AWS_REGION || 'ap-northeast-1', // 환경 변수 사용
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '', // 환경 변수 사용
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '', // 환경 변수 사용
  },
});

// 2. Gemini 설정
const API_KEY = process.env.GOOGLE_AI_API_KEY || '';
const genAI = new GoogleGenAI({ apiKey: API_KEY });

// [LOG 2] 전역 설정 완료
console.log(
  `[LOG 2] Global Config Loaded. API Key Variable Loaded: ${API_KEY ? '✅ YES' : '❌ NO'}`,
);

export async function POST(request: NextRequest) {
  // [LOG 3] POST 함수 진입
  console.log('[LOG 3] POST function entered.');
  try {
    // [LOG 4] JSON Body 파싱 시도
    const { question } = await request.json(); // [LOG 5] JSON Body 파싱 완료
    console.log(`[LOG 5] Question received: "${question}"`);

    if (!question) {
      console.log('[LOG FAIL A] No question provided.');
      return NextResponse.json({ message: '질문이 없습니다.' }, { status: 400 });
    }

    if (!API_KEY) {
      console.error('[LOG FAIL B] CRITICAL: API key is empty! Check .env.local.');
      return NextResponse.json(
        {
          message: 'AI 서비스 키가 .env.local에 설정되지 않았거나 로드되지 않았습니다.',
        },
        { status: 500 },
      );
    }

    console.log('[LOG 6] Starting Gemini model initialization.');
    console.log('[LOG 8] Constructing SQL prompt.');
    const prompt = `
      You are an expert Data Analyst converting natural language questions into AWS Timestream SQL queries.
      
      [Database Schema]
      - Database: "WheelchairDB"
      - Table: "WheelchairMetricsTable"
      - Common Columns:
        - time (Timestamp)
        - device_serial (Varchar): Device IMEI (e.g., '01222611455')
        - measure_name (Varchar): Identifies the type of data
        - measure_value::double (Double): The actual value
      
      [Measure Names & Metrics]
      1. Battery Level: measure_name = 'battery_percent' (Unit: %)
      2. Speed: measure_name = 'speed' (Unit: m/h or m/s)
      3. Distance: measure_name = 'distance' (Unit: meter)

      [SQL Rules for Timestream]
      - ALWAYS use double quotes for Database and Table names: "WheelchairDB"."WheelchairMetricsTable".
      - When aggregating by time, use 'BIN(time, 1h)' for hourly or 'BIN(time, 1d)' for daily.
      - To filter by metric, use: WHERE measure_name = 'target_metric'.
      - For relative time filtering, **DO NOT USE INTERVAL**. Use **date_add('day', -1, now())** to calculate a date offset.
      - Example (Hourly Avg Battery for Yesterday, Timestream Syntax): 
        SELECT BIN(time, 1h) as time_slot, AVG(measure_value::double) as avg_val 
        FROM "WheelchairDB"."WheelchairMetricsTable" 
        WHERE measure_name = 'battery_percent' AND device_serial = '...' 
        AND time BETWEEN date_trunc('day', date_add('day', -1, now())) AND date_trunc('day', now())
        GROUP BY BIN(time, 1h) ORDER BY time_slot DESC

      [User Request]: "${question}"
      
      [Output Requirement]
      - Return ONLY the raw SQL query string. 
      - Do NOT include markdown formatting (like \`\`\`sql).
      - Do NOT include explanations.
    `;
    console.log('✅ [LOG 9] Calling Gemini API for SQL generation...');
    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    console.log('[LOG 10] Gemini response received.'); // ⭐️⭐️ [수정 1] result.text가 유효한지 확인하고, 유효하지 않으면 사용자에게 피드백을 줍니다. ⭐️⭐️
    let generatedSql = result.text || ''; // null 또는 undefined인 경우 빈 문자열로 초기화

    if (generatedSql.trim().length === 0) {
      // SQL을 생성해야 하는데, 빈 응답이 온 경우
      console.error('[LOG FAIL D] Gemini returned empty response or invalid content.');
      return NextResponse.json(
        {
          message: 'Gemini가 데이터베이스 질문과 무관한 요청에는 SQL을 생성할 수 없습니다.',
          sql: null,
          data: [],
        },
        { status: 200 }, // 500 대신 200으로 처리하여 클라이언트 에러 알림 방지
      );
    } // ⭐️⭐️ [수정 2] String() 함수를 사용하여 replace 호출 전에 문자열임을 보장합니다. ⭐️⭐️

    generatedSql = String(generatedSql)
      .replace(/```sql/g, '')
      .replace(/```/g, '')
      .trim();

    console.log('🤖 [LOG 11] Generated SQL:', generatedSql); // 5. 보안 점검 (SELECT 문만 허용)

    console.log('[LOG 12] Starting security check.');
    if (!generatedSql.toLowerCase().startsWith('select')) {
      console.log('[LOG FAIL C] Security check failed: Not a SELECT query.');
      return NextResponse.json(
        {
          message: '생성된 쿼리가 SELECT 문이 아니거나, 데이터베이스 질문이 아닙니다.',
          sql: generatedSql, // 생성된 쿼리도 같이 반환
          data: [],
        },
        { status: 200 },
      );
    } // 6. SQL 실행 (Timestream)

    console.log('[LOG 13] Attempting to send query to Timestream...');
    const command = new QueryCommand({ QueryString: generatedSql });
    const tsResponse = await queryClient.send(command);
    console.log('[LOG 14] Timestream query successful.'); // 7. 결과값 보기 좋게 변환 (JSON)

    console.log('[LOG 15] Formatting results.');
    const rows = tsResponse.Rows || [];
    const colInfo = tsResponse.ColumnInfo || [];

    const formattedData = rows.map((row) => {
      const obj: any = {};
      row.Data?.forEach((cell, i) => {
        const key = colInfo[i].Name || `col${i}`;
        obj[key] = cell.ScalarValue;
      });
      return obj;
    });

    console.log('[LOG 16] Returning final response (200 OK).');
    return NextResponse.json({
      question: question,
      sql: generatedSql,
      data: formattedData,
    });
  } catch (error: any) {
    // [LOG CATCH] 에러 발생
    console.error('--- [LOG CATCH] Error caught ---');
    const errorMessage = error.message || 'AI 처리 중 오류 발생';
    console.error('AI Search Error Details:', errorMessage);

    return NextResponse.json(
      {
        error: errorMessage,
        message: `서버 오류 발생: ${errorMessage}`,
        sql: null,
        data: [],
      },
      { status: 500 },
    );
  }
}
