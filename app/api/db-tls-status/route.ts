import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { getDbTlsStatus } from '@/lib/db';

// 🔎 DB TLS 검증이 실제로 켜졌는지 확인용 (로그인 필요). 민감정보 없음(불리언만).
export async function GET() {
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
