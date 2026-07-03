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
  return NextResponse.json(getDbTlsStatus());
}
