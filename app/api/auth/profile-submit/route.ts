import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions'; 
import { query } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    // @ts-ignore
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ message: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }

    const { name, organization, phoneNumber } = await req.json();

    if (!name || !organization || !phoneNumber) {
      return NextResponse.json({ message: '필수 값이 누락되었습니다.' }, { status: 400 });
    }

    // 1. DB 업데이트 (GUEST -> PENDING)
    const sql = `
      UPDATE users 
      SET 
        name = $1, 
        organization = $2, 
        phone_number = $3, 
        role = 'PENDING', 
        updated_at = NOW()
      WHERE id = $4
    `;

    // 2. 쿼리 실행
    const result = await query(sql, [name, organization, phoneNumber, userId]);

    if (result.rowCount === 0) {
      // 이 경우는 GUEST 토큰이 만료되었을 때 발생할 수 있습니다.
      return NextResponse.json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    console.log(`✅ [API] User ${userId} 프로필 업데이트 완료 (GUEST -> PENDING)`);
    
    // 3. 200 OK 응답 반환 (클라이언트에게 세션 갱신 신호를 보냄)
    return NextResponse.json({ success: true, newRole: 'PENDING' }, { status: 200 });

  } catch (error) {
    console.error('❌ [API CRASH] 프로필 업데이트 실패:', error);
    return NextResponse.json({ message: '서버 내부 오류가 발생했습니다.' }, { status: 500 });
  }
}