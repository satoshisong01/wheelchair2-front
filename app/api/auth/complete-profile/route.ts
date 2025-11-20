import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
// ‼️ [수정] 1인 개발자님의 TypeORM 기반 authOptions 임포트
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { AppDataSource, connectDatabase } from '@/lib/db';
import { User, UserRole } from '@/entities/User';

/**
 * [POST] /api/auth/complete-profile
 * /welcome 페이지에서 관리자 정보를 받아 저장하고, 필요시 재신청(PENDING 변경) 처리합니다.
 */
export async function POST(request: Request) {
  try {
    // 1. 세션 확인
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.dbUserId) {
      return NextResponse.json(
        { message: '인증되지 않은 사용자입니다.' },
        { status: 401 }
      );
    }

    // 2. 요청 본문(body) 파싱
    const { name, organization, phoneNumber } = await request.json();

    // 3. 필수 정보 유효성 검사
    if (!name || !organization || !phoneNumber) {
      return NextResponse.json(
        { message: '이름, 소속, 전화번호는 필수입니다.' },
        { status: 400 }
      );
    }

    // 4. DB 연결 및 사용자 조회
    await connectDatabase();
    const UserRepo = AppDataSource.getRepository(User);
    const userId = session.user.dbUserId;

    const userToUpdate = await UserRepo.findOne({ where: { id: userId } });

    if (!userToUpdate) {
      return NextResponse.json(
        { message: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 5. 정보 업데이트
    userToUpdate.name = name;
    userToUpdate.organization = organization;
    userToUpdate.phoneNumber = phoneNumber;

    // 🚨 [핵심 로직 추가] 거절된(REJECTED) 사용자라면 -> 다시 승인 대기(PENDING)로 상태 변경!
    if (userToUpdate.role === UserRole.REJECTED) {
      console.log(`[API] User ${userId} 재신청: REJECTED -> PENDING`);
      userToUpdate.role = UserRole.PENDING; // 상태를 PENDING으로 복구
      userToUpdate.rejectionReason = null; // 기존 거절 사유 삭제 (깨끗하게)
    }

    // (참고: 이미 PENDING이거나 정보가 없던 신규 가입자는 PENDING 상태가 그대로 유지됨)

    await UserRepo.save(userToUpdate);

    console.log(
      `[API /complete-profile] 사용자 ID ${userId} 프로필 업데이트 및 재신청 완료`
    );

    // 6. 성공 응답
    return NextResponse.json(
      {
        message: '프로필이 성공적으로 업데이트되었습니다.',
        user: {
          name: userToUpdate.name,
          organization: userToUpdate.organization,
          phoneNumber: userToUpdate.phoneNumber,
          role: userToUpdate.role, // 변경된 role 정보 반환
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[/api/auth/complete-profile] POST 오류:', error);
    return NextResponse.json(
      { message: '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
