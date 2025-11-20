// 📍 경로: app/api/admin/users/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { AppDataSource, connectDatabase } from '@/lib/db';
import { User } from '@/entities/User';

/**
 * [GET] /api/admin/users
 * (MASTER 전용) 모든 사용자 목록(관리자, 승인대기자)을 조회합니다.
 */
export async function GET(request: Request) {
  try {
    // 1. 세션 확인 (MASTER인지)
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'MASTER') {
      return NextResponse.json(
        { message: '접근 권한이 없습니다.' },
        { status: 403 } // Forbidden
      );
    }

    // 2. DB 연결
    await connectDatabase();
    const UserRepo = AppDataSource.getRepository(User);

    // 3. 모든 사용자 조회 (보안을 위해 kakaoId 등 민감 정보 제외)
    const users = await UserRepo.find({
      select: {
        id: true,
        name: true,
        email: true,
        organization: true,
        phoneNumber: true,
        role: true,
        createdAt: true,
      },
      order: {
        role: 'ASC', // PENDING 상태가 맨 위로 오도록 정렬
        createdAt: 'DESC',
      },
    });

    return NextResponse.json(users, { status: 200 });
  } catch (error) {
    console.error('[/api/admin/users] GET 오류:', error);
    return NextResponse.json(
      { message: '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
