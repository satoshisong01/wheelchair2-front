import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { AppDataSource, connectDatabase } from '@/lib/db';
import { User, UserRole } from '@/entities/User';
import { AdminAuditLog, AdminAuditLogAction } from '@/entities/AdminAuditLog';

// Next.js 15+ 호환성
interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * [PATCH] /api/admin/users/[id]
 * 사용자 역할 변경 (승인/거절) 및 감사 로그 기록
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const targetUserId = parseInt(id, 10);

    // 1. 세션 확인 (MASTER 권한 필수)
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'MASTER' || !session.user.dbUserId) {
      return NextResponse.json(
        { message: '접근 권한이 없습니다.' },
        { status: 403 }
      );
    }
    const masterAdminId = session.user.dbUserId;

    if (isNaN(targetUserId)) {
      return NextResponse.json(
        { message: '잘못된 사용자 ID입니다.' },
        { status: 400 }
      );
    }

    // 2. 요청 본문 파싱 (role, reason)
    const { role, reason } = await request.json();

    let newRole: UserRole;
    let logAction: AdminAuditLogAction;
    let logDetails = '';

    // 승인 요청인 경우
    if (role === 'ADMIN') {
      newRole = UserRole.ADMIN;
      logAction = AdminAuditLogAction.ADMIN_APPROVE;
      logDetails = `MASTER(ID: ${masterAdminId})가 사용자(ID: ${targetUserId})를 승인했습니다.`;
    }
    // 거절 요청인 경우
    else if (role === 'REJECTED') {
      newRole = UserRole.REJECTED;
      logAction = AdminAuditLogAction.ADMIN_REJECT; // (엔티티에 이 Enum이 없다면 추가 필요, 일단 문자열 처리됨)
      logDetails = `MASTER(ID: ${masterAdminId})가 사용자(ID: ${targetUserId})를 거절했습니다. 사유: ${
        reason || '없음'
      }`;
    } else {
      return NextResponse.json(
        { message: '유효하지 않은 역할 변경 요청입니다.' },
        { status: 400 }
      );
    }

    // 3. DB 트랜잭션 시작
    await connectDatabase();
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const UserRepo = queryRunner.manager.getRepository(User);
      const LogRepo = queryRunner.manager.getRepository(AdminAuditLog);

      const targetUser = await UserRepo.findOne({
        where: { id: targetUserId },
      });

      if (!targetUser) {
        await queryRunner.rollbackTransaction();
        return NextResponse.json(
          { message: '대상 사용자를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      // 4. 사용자 정보 업데이트 (역할 및 거절 사유)
      targetUser.role = newRole;
      if (role === 'REJECTED') {
        targetUser.rejectionReason = reason; // User 엔티티에 필드 추가 필요 (아래 설명 참조)
      } else {
        targetUser.rejectionReason = null; // 승인 시 사유 초기화
      }

      await UserRepo.save(targetUser);

      // 5. 감사 로그 기록
      const newLog = LogRepo.create({
        actionType: logAction,
        details: logDetails,
        adminUserId: masterAdminId,
      });
      await LogRepo.save(newLog);

      await queryRunner.commitTransaction();

      return NextResponse.json(
        {
          success: true,
          user: {
            id: targetUser.id,
            role: targetUser.role,
            rejectionReason: targetUser.rejectionReason,
          },
        },
        { status: 200 }
      );
    } catch (txError) {
      await queryRunner.rollbackTransaction();
      throw txError;
    } finally {
      await queryRunner.release();
    }
  } catch (error: any) {
    console.error(`[/api/admin/users/ID] PATCH 오류:`, error);
    return NextResponse.json(
      { message: error.message || '서버 오류 발생' },
      { status: 500 }
    );
  }
}
