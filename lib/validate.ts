// lib/validate.ts
// 🔒 [SI-05] 입력 검증 공용 헬퍼 — 시스템 경계(API body)에서 스키마 검증.
//   설계 원칙: "정상 사용자 입력은 그대로 통과"하는 안전망. 과대 크기/잘못된 타입만 차단하고,
//   실패 시 각 라우트가 기존에 쓰던 400 메시지를 그대로 반환해 사용자 체감 변화가 없도록 한다.

import { NextResponse } from 'next/server';
import type { z } from 'zod';

type ParseResult<T> = { data: T } | { error: NextResponse };

/**
 * 요청 body를 파싱하고 zod 스키마로 검증한다.
 * 호출부: `const parsed = await parseJsonBody(...); if ('error' in parsed) return parsed.error; parsed.data 사용`
 * @param req      요청 객체
 * @param schema   zod 스키마
 * @param message  검증 실패 시 반환할 400 메시지(기존 라우트 메시지를 넘겨 UX 보존)
 */
export async function parseJsonBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
  message = '입력값이 올바르지 않습니다.',
): Promise<ParseResult<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: NextResponse.json({ message }, { status: 400 }) };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: NextResponse.json({ message }, { status: 400 }) };
  }

  return { data: parsed.data };
}
