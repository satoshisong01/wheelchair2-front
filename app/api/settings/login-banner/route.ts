// 📍 경로: app/api/settings/login-banner/route.ts
// 🔒 [uc_auth_11] 로그인 화면 시스템 사용 알림 배너 — 공개 조회(GET) / MASTER 전용 변경(PUT, 감사기록 BANNER_UPDATE)

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/authOptions';
import { query } from '@/lib/db';
import { createAuditLog } from '@/lib/log';
import {
  DEFAULT_LOGIN_BANNER,
  LOGIN_BANNER_KEY,
  LOGIN_BANNER_MAX_LENGTH,
  getLoginBanner,
  normalizeBannerText,
} from '@/lib/login-banner';
import { logServerError, summarizeError } from '@/lib/server-log';
import { parseJsonBody } from '@/lib/validate';

// 빌드 시 정적 응답으로 굳지 않도록 매 요청 처리 (DB 조회는 아래 메모리 캐시로 제한)
export const dynamic = 'force-dynamic';

// 공개 GET은 인증 없이 호출되므로 프로세스 메모리에 잠깐 보관해 DB 조회를 분당 1회 수준으로 제한
const PUBLIC_CACHE_TTL_MS = 60 * 1000;
let publicCache: { text: string; expiresAt: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (!publicCache || publicCache.expiresAt <= now) {
    publicCache = { text: await getLoginBanner(), expiresAt: now + PUBLIC_CACHE_TTL_MS };
  }
  return NextResponse.json(
    { text: publicCache.text, defaultText: DEFAULT_LOGIN_BANNER },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}

const bannerSchema = z.object({
  text: z
    .string()
    .max(LOGIN_BANNER_MAX_LENGTH * 2) // 정규화 전 과대 입력은 바로 거절
    .transform(normalizeBannerText)
    .pipe(z.string().min(1).max(LOGIN_BANNER_MAX_LENGTH)),
});

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { id: userId, role: userRole } = session.user;
  if (userRole !== 'MASTER') {
    await createAuditLog({
      userId,
      userRole,
      action: 'BANNER_UPDATE',
      outcome: 'FAILURE',
      details: { key: LOGIN_BANNER_KEY, reason: 'FORBIDDEN' },
      deviceSerial: session.user.deviceId, // 기기 계정이면 화면에 시리얼로 표시
    });
    return NextResponse.json({ message: '접근 권한이 없습니다.' }, { status: 403 });
  }

  const parsed = await parseJsonBody(
    req,
    bannerSchema,
    `알림 문구는 1~${LOGIN_BANNER_MAX_LENGTH}자로 입력해주세요.`,
  );
  if ('error' in parsed) return parsed.error;
  const { text } = parsed.data;

  try {
    // 변경 전 값은 같은 문장에서 읽어 감사기록에 남김 (WITH 안의 문장들은 갱신 전 스냅샷을 본다)
    const result = await query(
      `WITH prev AS (SELECT value FROM system_settings WHERE key = $1),
            upsert AS (
              INSERT INTO system_settings (key, value, updated_by, updated_at)
              VALUES ($1, $2, $3, NOW())
              ON CONFLICT (key) DO UPDATE
                SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
              RETURNING key
            )
       SELECT (SELECT value FROM prev) AS previous_value FROM upsert`,
      [LOGIN_BANNER_KEY, text, userId],
    );
    const previous: unknown = result.rows[0]?.previous_value;

    publicCache = { text, expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS };
    try {
      // '/'·'/login'은 배너를 첫 HTML에 싣는 ISR 페이지 → 다음 요청부터 새 문구로 다시 생성
      revalidatePath('/');
      revalidatePath('/login');
    } catch (error) {
      // 저장은 끝났으므로 실패 응답을 주지 않음 (최대 60초 뒤 ISR 주기로 반영)
      logServerError('Login banner revalidate failed', error);
    }

    await createAuditLog({
      userId,
      userRole,
      action: 'BANNER_UPDATE',
      details: {
        key: LOGIN_BANNER_KEY,
        before: typeof previous === 'string' ? previous : null,
        after: text,
      },
    });

    return NextResponse.json({ text });
  } catch (error) {
    logServerError('Login banner update failed', error);
    await createAuditLog({
      userId,
      userRole,
      action: 'BANNER_UPDATE',
      outcome: 'FAILURE',
      details: { key: LOGIN_BANNER_KEY, reason: 'DB_ERROR', code: summarizeError(error).code ?? 'N/A' },
    });
    return NextResponse.json({ message: '알림 문구 저장에 실패했습니다.' }, { status: 500 });
  }
}
