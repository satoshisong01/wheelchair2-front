import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { getDbTlsStatus } from '@/lib/db';
import { withRequestAudit } from '@/lib/api-audit';

// 🔎 DB TLS 검증이 실제로 켜졌는지 확인용 (로그인 필요). 민감정보 없음(불리언만).
async function handleGet() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const status = getDbTlsStatus();
  // 🔒 서버 파일 경로는 내부 구성 정보라 'file'로만 표시 (응답 형식은 동일)
  return NextResponse.json({
    ...status,
    caSource: status.caSource.startsWith('file:') ? 'file' : status.caSource,
  });
}

// 🔒 [UC-04] 오류 응답(4xx·5xx)은 감사기록 '요청 오류'로 남긴다 (lib/api-audit.ts)
export const GET = withRequestAudit(handleGet);
