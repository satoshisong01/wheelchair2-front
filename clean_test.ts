// clean_test.ts 파일 (ESM 방식)

import { GoogleGenAI } from '@google/genai';

// dotenv를 사용하여 .env 파일을 로드합니다. (일반 Node.js 환경이므로 필요)
import * as dotenv from 'dotenv';
dotenv.config();

// =================================================================
// ★★★ [수정] require 대신 import를 사용합니다. ★★★
// =================================================================

const MY_API_KEY = process.env.GEMINI_API_KEY;

async function testSimpleGeminiConnection() {
  console.log('--- 🚀 Gemini API 단독 연결 테스트 시작 (TS/ESM) ---');

  if (!MY_API_KEY) {
    console.error('\n[오류] .env 파일에서 GEMINI_API_KEY를 읽을 수 없습니다.');
    console.log(
      "키가 .env 파일에 'GEMINI_API_KEY=...' 형식으로 설정되어 있는지 확인해주세요."
    );
    return;
  }

  try {
    // 클라이언트 초기화 (키를 직접 전달)
    const ai = new GoogleGenAI({ apiKey: MY_API_KEY });

    const question = 'Hello, are you receiving this message and working?';
    console.log(`\n질문 전송 중: '${question}'`);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: question,
    });

    const responseText = response.text;

    console.log('\n[✅ 연결 성공!]');
    console.log('답변:', responseText);
  } catch (error: any) {
    console.log('\n[❌ 연결 실패 - 상세 에러 로그 확인]');
    console.error('에러 메시지:', error.message);
  }
}

testSimpleGeminiConnection();
