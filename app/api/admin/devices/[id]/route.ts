// 📍 경로: app/api/admin/devices/[id]/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { AppDataSource, connectDatabase } from '@/lib/db';
import { Wheelchair } from '@/entities/Wheelchair';
import { DeviceAuth } from '@/entities/DeviceAuth';
import { AdminAuditLog, AdminAuditLogAction } from '@/entities/AdminAuditLog';
import { In } from 'typeorm';

// 🚨 [수정 1] Next.js 15+ 대응: params를 Promise로 정의
interface DeleteParams {
  params: Promise<{ id: string }>;
}

/**
 * [DELETE] /api/admin/devices/[id]
 * (ADMIN/MASTER 전용) 휠체어 기기 및 기기 로그인 계정을 삭제합니다.
 */
export async function DELETE(request: Request, { params }: DeleteParams) {
  try {
    // 1. 세션 확인 (ADMIN 또는 MASTER인지)
    const session = await getServerSession(authOptions);
    if (
      !session ||
      !['ADMIN', 'MASTER'].includes(session.user.role || '') ||
      !session.user.dbUserId
    ) {
      return NextResponse.json(
        { message: '접근 권한이 없습니다.' },
        { status: 403 }
      );
    }

    // 🚨 [수정 2] params를 await로 풀어서 id 꺼내기
    const { id } = await params;

    const adminId = session.user.dbUserId; // 작업을 수행하는 관리자 ID
    const targetWheelchairId = parseInt(id, 10); // params.id -> id 로 변경

    if (isNaN(targetWheelchairId)) {
      return NextResponse.json(
        { message: '잘못된 휠체어 ID입니다.' },
        { status: 400 }
      );
    }

    // 2. DB 연결 (트랜잭션 사용)
    await connectDatabase();
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const WheelchairRepo = queryRunner.manager.getRepository(Wheelchair);
      const DeviceAuthRepo = queryRunner.manager.getRepository(DeviceAuth);
      const LogRepo = queryRunner.manager.getRepository(AdminAuditLog);

      // 3. 삭제할 휠체어 정보 조회 (로그 기록 및 deviceAuthId 확보용)
      const wheelchairToDelete = await WheelchairRepo.findOne({
        where: { id: targetWheelchairId },
        relations: ['deviceAuth'], // 연결된 DeviceAuth 정보 로드
      });

      if (!wheelchairToDelete) {
        await queryRunner.rollbackTransaction();
        return NextResponse.json(
          { message: '삭제할 휠체어를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      const deviceAuthIdToDelete = wheelchairToDelete.deviceAuth?.id;
      const serialForLog = wheelchairToDelete.deviceSerial;
      const deviceIdForLog = wheelchairToDelete.deviceAuth?.deviceId || 'N/A';

      // 4. 작업 1: 휠체어 삭제
      // (Wheelchair 엔티티의 alarms, maintenanceLogs, status 관계에
      //  onDelete: 'CASCADE'가 설정되어 있어야 관련 데이터가 자동 삭제됩니다.)
      await WheelchairRepo.delete(targetWheelchairId);

      // 5. 작업 2: 연결된 기기 로그인 계정(DeviceAuth) 삭제
      if (deviceAuthIdToDelete) {
        await DeviceAuthRepo.delete(deviceAuthIdToDelete);
      }

      // 6. 작업 3: 감사 로그 기록
      const logDetails = `관리자(ID: ${adminId})가 기기(S/N: ${serialForLog}, ID: ${deviceIdForLog})를 삭제했습니다.`;
      const newLog = LogRepo.create({
        actionType: AdminAuditLogAction.DEVICE_DELETE,
        details: logDetails,
        adminUserId: adminId,
      });
      await LogRepo.save(newLog);

      // 7. 트랜잭션 완료
      await queryRunner.commitTransaction();

      console.log(`[API /admin/devices] ${logDetails}`);

      return NextResponse.json(
        { message: '기기가 성공적으로 삭제되었습니다.' },
        { status: 200 }
      );
    } catch (txError) {
      // 트랜잭션 중 오류 발생 시 롤백
      await queryRunner.rollbackTransaction();
      throw txError; // 외부 catch 블록으로 에러 던지기
    } finally {
      // 쿼리 러너 해제
      await queryRunner.release();
    }
  } catch (error) {
    console.error(`[/api/admin/devices/ID] DELETE 오류:`, error);
    return NextResponse.json(
      { message: '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
