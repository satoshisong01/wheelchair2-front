// 📍 경로: app/api/admin/devices/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { AppDataSource, connectDatabase } from '@/lib/db';
import { Wheelchair } from '@/entities/Wheelchair';
import { DeviceAuth } from '@/entities/DeviceAuth';
import { AdminAuditLog, AdminAuditLogAction } from '@/entities/AdminAuditLog';
import bcrypt from 'bcrypt';

/**
 * [GET] /api/admin/devices
 * (ADMIN/MASTER 전용) 등록된 모든 휠체어/기기 목록을 조회합니다.
 */
export async function GET(request: Request) {
  try {
    // 1. 세션 확인 (ADMIN 또는 MASTER인지)
    const session = await getServerSession(authOptions);
    if (!session || !['ADMIN', 'MASTER'].includes(session.user.role || '')) {
      return NextResponse.json(
        { message: '접근 권한이 없습니다.' },
        { status: 403 }
      );
    }

    // 2. DB 연결
    await connectDatabase();
    const WheelchairRepo = AppDataSource.getRepository(Wheelchair);

    // 3. 휠체어 목록 조회 (등록한 관리자, 기기 로그인 ID 포함)
    const devices = await WheelchairRepo.find({
      relations: {
        registeredBy: true, // 등록한 관리자 정보
        deviceAuth: true, // 연결된 기기 로그인 계정
      },
      select: {
        id: true,
        deviceSerial: true,
        modelName: true,
        createdAt: true,
        physicalStatus: true,
        registeredBy: {
          // (보안) 관리자의 민감 정보 제외
          id: true,
          name: true,
          email: true,
        },
        deviceAuth: {
          // (보안) 비밀번호 제외
          id: true,
          deviceId: true,
        },
      },
      order: {
        createdAt: 'DESC',
      },
    });

    return NextResponse.json(devices, { status: 200 });
  } catch (error) {
    console.error('[/api/admin/devices] GET 오류:', error);
    return NextResponse.json(
      { message: '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * [POST] /api/admin/devices
 * (ADMIN/MASTER 전용) 신규 휠체어 기기 및 기기 로그인 계정을 등록합니다.
 */
export async function POST(request: Request) {
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

    const adminId = session.user.dbUserId; // 작업을 수행하는 관리자 ID

    // 2. 요청 본문(body) 파싱
    const { deviceSerial, modelName, deviceId, password } =
      await request.json();

    // 3. 필수 정보 유효성 검사
    if (!deviceSerial || !modelName || !deviceId || !password) {
      return NextResponse.json(
        { message: '기기 시리얼, 모델명, 기기 ID, 비밀번호는 필수입니다.' },
        { status: 400 }
      );
    }

    // 4. 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(password, 10);

    // 5. DB 연결 (트랜잭션 사용)
    await connectDatabase();
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const DeviceAuthRepo = queryRunner.manager.getRepository(DeviceAuth);
      const WheelchairRepo = queryRunner.manager.getRepository(Wheelchair);
      const LogRepo = queryRunner.manager.getRepository(AdminAuditLog);

      // 6. 작업 1: 기기 로그인 계정(DeviceAuth) 생성
      const newDeviceAuth = DeviceAuthRepo.create({
        deviceId: deviceId,
        password: hashedPassword,
      });
      await DeviceAuthRepo.save(newDeviceAuth);

      // 7. 작업 2: 휠체어(Wheelchair) 생성 및 계정 연결
      const newWheelchair = WheelchairRepo.create({
        deviceSerial: deviceSerial,
        modelName: modelName,
        registeredById: adminId,
        deviceAuth: newDeviceAuth, // deviceAuthId 대신 객체를 직접 넣어도 됩니다 (TypeORM이 처리)
      });
      await WheelchairRepo.save(newWheelchair);

      newDeviceAuth.wheelchair = newWheelchair;
      await DeviceAuthRepo.save(newDeviceAuth);

      // 8. 작업 3: 감사 로그 기록
      const logDetails = `관리자(ID: ${adminId})가 새 기기(S/N: ${deviceSerial}, ID: ${deviceId})를 등록했습니다.`;
      const newLog = LogRepo.create({
        actionType: AdminAuditLogAction.DEVICE_CREATE,
        details: logDetails,
        adminUserId: adminId,
      });
      await LogRepo.save(newLog);

      // 9. 트랜잭션 완료
      await queryRunner.commitTransaction();

      console.log(`[API /admin/devices] ${logDetails}`);

      return NextResponse.json(newWheelchair, { status: 201 }); // 201 Created
    } catch (txError: any) {
      // 트랜잭션 중 오류 발생 시 롤백
      await queryRunner.rollbackTransaction();

      // [오류 처리] 고유 ID 중복 오류 (deviceId 또는 deviceSerial)
      if (txError.code === '23505') {
        // PostgreSQL Unique Violation
        if (txError.detail.includes('device_id')) {
          return NextResponse.json(
            { message: `기기 ID '${deviceId}'가 이미 존재합니다.` },
            { status: 409 }
          );
        }
        if (txError.detail.includes('device_serial')) {
          return NextResponse.json(
            { message: `기기 시리얼 '${deviceSerial}'이 이미 존재합니다.` },
            { status: 409 }
          );
        }
      }
      throw txError; // 외부 catch 블록으로 에러 던지기
    } finally {
      // 쿼리 러너 해제
      await queryRunner.release();
    }
  } catch (error) {
    console.error('[/api/admin/devices] POST 오류:', error);
    return NextResponse.json(
      { message: '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
