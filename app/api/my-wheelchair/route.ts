// 📍 경로: app/api/my-wheelchair/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { AppDataSource, connectDatabase } from '@/lib/db';
import { Wheelchair } from '@/entities/Wheelchair';
import { WheelchairStatus } from '@/entities/WheelchairStatus';
import { Alarm } from '@/entities/Alarm';
import { MaintenanceLog } from '@/entities/MaintenanceLog';

/**
 * [GET] /api/my-wheelchair
 * (DEVICE_USER 전용)
 * 로그인된 기기 사용자의 휠체어 ID에 해당하는 모든 정보
 * (기본 정보, 최신 상태, 알람 전체, 정비 이력 전체)를 조회합니다.
 */
export async function GET(request: Request) {
  try {
    // --- 1. 사용자 인증 및 권한 확인 ---
    const session = await getServerSession(authOptions);

    // ‼️ [핵심] DEVICE_USER 역할인지, wheelchairId가 세션에 있는지 확인
    if (
      !session ||
      !session.user ||
      session.user.role !== 'DEVICE_USER' ||
      !session.user.wheelchairId
    ) {
      return NextResponse.json(
        { error: 'Unauthorized: 기기 사용자로 로그인되지 않았습니다.' },
        { status: 401 }
      );
    }

    // ‼️ 세션에서 내 휠체어 ID 획득
    const myWheelchairId = session.user.wheelchairId;

    // --- 2. DB 연결 ---
    await connectDatabase();
    const WheelchairRepo = AppDataSource.getRepository(Wheelchair);

    // --- 3. [수정] 휠체어 데이터 조회 (QueryBuilder 사용) ---
    // 휠체어 기본 정보, 최신 상태, 알람, 정비 이력을 한번에 Join해서 가져옵니다.
    const wheelchairData = await WheelchairRepo.createQueryBuilder('wheelchair')
      .leftJoinAndSelect('wheelchair.status', 'status')
      .leftJoinAndSelect('wheelchair.alarms', 'alarms')
      .leftJoinAndSelect('wheelchair.maintenanceLogs', 'maintenanceLogs')
      .where('wheelchair.id = :id', { id: myWheelchairId })
      .orderBy({
        'alarms.alarmTime': 'DESC', // 알람은 최신순
        'maintenanceLogs.createdAt': 'DESC', // 정비 이력도 최신순
      })
      .getOne(); // ‼️ ID로 조회하므로 getOne() 사용

    if (!wheelchairData) {
      return NextResponse.json(
        { error: `휠체어(ID: ${myWheelchairId}) 정보를 찾을 수 없습니다.` },
        { status: 404 }
      );
    }

    // --- 4. 성공 응답 ---
    // (wheelchairData 객체 안에 status, alarms, maintenanceLogs가 모두 포함되어 있음)
    return NextResponse.json(wheelchairData);
  } catch (error: unknown) {
    let errorMessage = 'Internal Server Error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error(
      '[API /my-wheelchair] GET 요청 처리 실패:',
      errorMessage,
      error
    );
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
