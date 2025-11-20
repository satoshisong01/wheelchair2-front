// 📍 경로: app/api/alarms/route.ts

import { NextResponse, NextRequest } from 'next/server'; // 💡 NextRequest 추가
import { getServerSession } from 'next-auth/next';
import { Repository } from 'typeorm';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { AppDataSource, connectDatabase } from '@/lib/db';
import { Alarm } from '@/entities/Alarm';

export async function GET(request: NextRequest) {
  // 💡 Request 타입을 NextRequest로 변경
  try {
    // --- 1. 사용자 인증 및 권한 확인 ---
    const session = await getServerSession(authOptions);
    const url = new URL(request.url); // 💡 URL 객체 생성

    // ‼️ [수정 1] DEVICE_USER 권한도 접근 허용
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized: 인증되지 않았습니다.' },
        { status: 401 }
      );
    }

    const userRole = session.user.role;
    const isManager = ['ADMIN', 'MASTER'].includes(userRole || '');
    const isDeviceUser = userRole === 'DEVICE_USER';

    // ‼️ [수정 2] 권한 확인: 관리자가 아니면서 기기 사용자도 아니면 접근 거부
    if (!isManager && !isDeviceUser) {
      return NextResponse.json(
        { error: 'Forbidden: 접근 권한이 없습니다.' },
        { status: 403 }
      );
    }

    // --- 2. DB 연결 및 필터링 ID 추출 ---
    await connectDatabase();
    const alarmRepo: Repository<Alarm> = AppDataSource.getRepository(Alarm);

    // 💡 [수정 3] 쿼리 파라미터에서 wheelchairId 추출
    const queryId = url.searchParams.get('wheelchairId');
    let filterId: number | undefined = undefined;

    // --- 3. 필터링 로직 설정 ---
    if (isManager && queryId && !isNaN(Number(queryId))) {
      // 관리자: URL에 ID가 있으면 해당 ID로 필터링
      filterId = Number(queryId);
    } else if (isDeviceUser) {
      // 기기 사용자: 세션에 저장된 본인의 휠체어 ID로 필터링
      // ‼️ [보안 강화 필요] 세션에 wheelchairId가 있어야 함. (없으면 0으로 처리)
      const sessionWcId = session.user.wheelchairId as number | undefined;

      if (!sessionWcId) {
        console.warn('[API /alarms] Device User 세션에 휠체어 ID가 없습니다.');
        // 휠체어 ID가 없으면 빈 목록 반환 (Unauthorized 대신)
        return NextResponse.json([]);
      }

      // 💡 [보안 강화 로직]: 프론트에서 queryId를 보냈더라도 세션의 휠체어 ID만 조회하도록 강제합니다.
      // 이는 프론트에서 다른 ID를 보내는 시도를 막습니다.
      filterId = sessionWcId;
    }

    // --- 4. DB 조회 ---
    const where: any = {};
    if (filterId) {
      // 🟢 [핵심 수정 4] 특정 휠체어 ID로 필터링 (기기 사용자 포함)
      where.wheelchairId = filterId;
      console.log(`[API /alarms] 특정 휠체어 알람 조회: ID ${filterId}`);
    } else {
      // 관리자가 필터 없이 요청했을 경우 (모든 알람)
      console.log('[API /alarms] Admin 권한: 전체 알람 조회');
    }

    const alarms = await alarmRepo.find({
      where: where, // 💡 where 객체 적용
      select: {
        id: true,
        wheelchairId: true,
        alarmType: true,
        alarmCondition: true,
        alarmStatus: true,
        alarmTime: true,
      },
      order: {
        alarmTime: 'DESC',
      },
      take: 100,
    });

    // --- 5. 성공 응답 ---
    return NextResponse.json(alarms);
  } catch (error: unknown) {
    let errorMessage = 'Internal Server Error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error('[API /alarms] GET 요청 처리 실패:', errorMessage, error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
