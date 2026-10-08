// app/api/ai-search/route.ts (안전성 강화)

import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/validate';
import { GoogleGenAI } from '@google/genai';
import { TimestreamQueryClient, QueryCommand } from '@aws-sdk/client-timestream-query';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { createAuditLog } from '@/lib/log';
import { logServerError, summarizeError } from '@/lib/server-log';

// 🔒 [보안] AI가 생성한 SQL에서 차단해야 할 위험 키워드 (Prompt Injection 방어 강화)
const FORBIDDEN_SQL_PATTERNS = [
  /\binsert\b/i,
  /\bupdate\b/i,
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\btruncate\b/i,
  /\balter\b/i,
  /\bcreate\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\battach\b/i,
  /\bexec\b/i,
  /;/, // 다중 쿼리 차단
  /--/, // SQL 주석 차단
  /\/\*/, // 블록 주석 차단
];

// 🔒 [보안] 허용된 테이블 식별자만 참조하도록 강제
const REQUIRED_TABLE_REF = /"WheelchairDB"\."WheelchairMetricsTable"/;
const ALLOWED_TABLE_REF = '"WheelchairDB"."WheelchairMetricsTable"';
// 점(.)으로 이은 식별자 쌍("A"."B", A.B, "A".B, A."B") — Timestream은 테이블을 DB.테이블로만 참조
const DOTTED_IDENTIFIER = /(?:"[^"]*"|\b[A-Za-z_]\w*)\s*\.\s*(?:"[^"]*"|[A-Za-z_]\w*)/g;
// FROM/JOIN 바로 뒤에 오는 참조 대상
const FROM_JOIN_TARGET = /\b(?:from|join)\s+("[^"]*"\s*\.\s*"[^"]*"|\(|[^\s,()]+)/gi;

// 🔒 [보안] 질문 단계에서 SQL 구분자·주석 기호를 미리 차단
const QUESTION_SQL_META = /;|--|\/\*/;

// 🔒 [보안] AI 생성 SQL의 반환 행 수·Timestream 응답 대기 상한 (과도한 조회·장시간 점유 방지)
const MAX_RESULT_ROWS = 1000;
const QUERY_TIMEOUT_MS = 10_000;

// 🔒 [보안] 생성 SQL의 모든 테이블 참조가 허용 테이블인지 전수 검사
//   (포함 여부만 보면 서브쿼리·UNION으로 다른 테이블을 끼워 넣어도 통과됨)
function referencesOnlyAllowedTable(sql: string): boolean {
  // 문자열 리터럴 안의 글자는 식별자가 아니므로 비우고 검사
  const code = sql.replace(/'(?:[^']|'')*'/g, "''");
  const dottedRefs: string[] = code.match(DOTTED_IDENTIFIER) ?? [];
  if (dottedRefs.some((ref) => ref.replace(/\s+/g, '') !== ALLOWED_TABLE_REF)) return false;

  // EXTRACT(HOUR FROM time)의 FROM은 테이블 참조가 아니므로 빼고 FROM/JOIN 대상을 확인
  const withoutExtract = code.replace(/\bextract\s*\(\s*[A-Za-z_]+\s+from\b/gi, 'extract(');
  for (const match of withoutExtract.matchAll(FROM_JOIN_TARGET)) {
    const target = match[1].replace(/\s+/g, '');
    if (target !== '(' && target !== ALLOWED_TABLE_REF) return false;
  }
  return true;
}

// 🔒 [보안] 끝에 LIMIT이 없으면 상한을 붙이고, 상한보다 크면 상한으로 낮춘다
function enforceRowLimit(sql: string): string {
  const trailingLimit = sql.match(/\blimit\s+(\d+)\s*$/i);
  if (!trailingLimit) return `${sql}\nLIMIT ${MAX_RESULT_ROWS}`;
  if (Number(trailingLimit[1]) <= MAX_RESULT_ROWS) return sql;
  return `${sql.slice(0, trailingLimit.index)}LIMIT ${MAX_RESULT_ROWS}`;
}

// [LOG 1] 파일 시작
console.log('--- [START] AI Dashboard API Route Load (Full Logic) ---');

// 1. Timestream 설정 (AWS 키 로드)
const queryClient = new TimestreamQueryClient({
  region: process.env.AWS_REGION || 'ap-northeast-1', // 환경 변수 사용
  // 정적 키가 없으면(EC2) credentials를 생략해 SDK가 인스턴스 IAM 역할을 쓰게 함
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

// 2. Gemini 설정
const API_KEY = process.env.GOOGLE_AI_API_KEY || '';
const genAI = new GoogleGenAI({ apiKey: API_KEY });

// [LOG 2] 전역 설정 완료
console.log(
  `[LOG 2] Global Config Loaded. API Key Variable Loaded: ${API_KEY ? '✅ YES' : '❌ NO'}`,
);

export async function POST(request: NextRequest) {
  // 🔒 [보안] 인증 체크 — ADMIN/MASTER만 AI 검색 허용
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== 'ADMIN' && userRole !== 'MASTER') {
    return NextResponse.json({ message: '접근 권한이 없습니다.' }, { status: 403 });
  }

  // 🔒 [감사] AI 질의 기록 — 질문·SQL 원문은 남기지 않고 길이·결과 건수·성공 여부만
  let questionLength = 0;
  const auditAiQuery = (details: Record<string, unknown>) =>
    createAuditLog({
      userId: session.user.id,
      userRole,
      action: 'AI_QUERY',
      details: { ...details, questionLength },
    });

  // [LOG 3] POST 함수 진입
  console.log('[LOG 3] POST function entered.');
  try {
    // [LOG 4] JSON Body 파싱 시도
    const parsed = await parseJsonBody(
      request,
      z.object({ question: z.string().min(1).max(10000) }),
      '질문이 없습니다.',
    );
    if ('error' in parsed) return parsed.error;
    const { question } = parsed.data; // [LOG 5] JSON Body 파싱 완료

    // 🔒 [보안] 사용자 입력 길이 제한 (과도한 비용/DoS 방지)
    if (question.length > 500) {
      return NextResponse.json({ message: '질문은 500자 이내로 입력해주세요.' }, { status: 400 });
    }
    // 🔒 [보안] SQL 구분자·주석 기호가 든 질문은 AI 호출 전에 차단
    if (QUESTION_SQL_META.test(question)) {
      return NextResponse.json(
        { message: '질문에 사용할 수 없는 기호(; -- /*)가 포함되어 있습니다.' },
        { status: 400 },
      );
    }
    questionLength = question.length;

    if (!API_KEY) {
      console.error('[LOG FAIL B] CRITICAL: API key is empty! Check .env.local.');
      // 🔒 [보안] 설정 파일명 등 내부 구성은 응답에 노출하지 않음
      return NextResponse.json(
        {
          message: 'AI 서비스를 일시적으로 사용할 수 없습니다.',
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
        - device_serial (Varchar): Device IMEI (e.g., '01200000000')
        - measure_name (Varchar): Identifies the type of data
        - measure_value::double (Double): The actual value
      
      [Measure Names & Metrics]
      1. Battery Level: measure_name = 'battery_percent' (Unit: %)
      2. Speed: measure_name = 'speed' (Unit: m/h or m/s)
      3. Distance: measure_name = 'distance' (Unit: meter)

      [SQL Rules for Timestream]
      - ALWAYS use double quotes for Database and Table names: "WheelchairDB"."WheelchairMetricsTable".
      - Do NOT use table aliases or alias-qualified column names (e.g., t.time); reference columns directly.
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
      await auditAiQuery({ status: 'Failed', reason: 'EMPTY_SQL' });
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

    // 🔒 [보안] 운영 환경에서 생성 SQL 로그 노출 방지 (DB 스키마 구조 노출)
    if (process.env.NODE_ENV !== 'production') {
      console.log('🤖 [LOG 11] Generated SQL:', generatedSql);
    }
    // 5. 보안 점검 (SELECT 문만 허용)

    console.log('[LOG 12] Starting security check.');

    // 🔒 [보안] 1단계 — SELECT 문으로 시작해야 함
    if (!generatedSql.toLowerCase().trim().startsWith('select')) {
      await auditAiQuery({ status: 'Failed', reason: 'NOT_SELECT' });
      return NextResponse.json(
        {
          message: '생성된 쿼리가 SELECT 문이 아니거나, 데이터베이스 질문이 아닙니다.',
          sql: null,
          data: [],
        },
        { status: 200 },
      );
    }

    // 🔒 [보안] 2단계 — 위험 키워드 차단 (DML/DDL/주석/세미콜론)
    for (const pattern of FORBIDDEN_SQL_PATTERNS) {
      if (pattern.test(generatedSql)) {
        console.warn('[Security] Forbidden SQL pattern detected:', pattern);
        await auditAiQuery({ status: 'Failed', reason: 'FORBIDDEN_PATTERN' });
        return NextResponse.json(
          {
            message: '허용되지 않은 쿼리가 감지되었습니다.',
            sql: null,
            data: [],
          },
          { status: 200 },
        );
      }
    }

    // 🔒 [보안] 3단계 — 허용된 테이블만 참조하도록 강제 (포함 여부 + 모든 참조 전수 검사)
    if (!REQUIRED_TABLE_REF.test(generatedSql) || !referencesOnlyAllowedTable(generatedSql)) {
      await auditAiQuery({ status: 'Failed', reason: 'TABLE_NOT_ALLOWED' });
      return NextResponse.json(
        {
          message: '허용되지 않은 테이블 참조입니다.',
          sql: null,
          data: [],
        },
        { status: 200 },
      );
    } // 6. SQL 실행 (Timestream)

    console.log('[LOG 13] Attempting to send query to Timestream...');
    const command = new QueryCommand({ QueryString: enforceRowLimit(generatedSql) });
    const tsResponse = await queryClient.send(command, {
      abortSignal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    });
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

    await auditAiQuery({ status: 'Success', resultCount: formattedData.length });

    console.log('[LOG 16] Returning final response (200 OK).');
    // 🔒 [보안] 생성 SQL(DB·테이블 구조)은 응답에 싣지 않음
    return NextResponse.json({
      question: question,
      data: formattedData,
    });
  } catch (error: unknown) {
    // 🔒 [보안] 내부 에러 상세는 서버 로그에만, 클라이언트에는 일반 메시지만 노출
    logServerError('[API /ai-search] Error', error);
    // 감사로그에는 오류 원문 대신 오류 코드(없으면 오류 이름)만 남김
    const { code, name } = summarizeError(error);
    await auditAiQuery({ status: 'Failed', reason: 'ERROR', errorCode: code ?? name });

    return NextResponse.json(
      {
        message: 'AI 검색 처리 중 오류가 발생했습니다.',
        sql: null,
        data: [],
      },
      { status: 500 },
    );
  }
}
