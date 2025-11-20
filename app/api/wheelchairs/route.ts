import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { Repository } from 'typeorm';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { AppDataSource, connectDatabase } from '@/lib/db';
import { Wheelchair } from '@/entities/Wheelchair';
import { DashboardWheelchair } from '@/types/wheelchair';

export async function GET(request: Request) {
  try {
    // --- 1. 사용자 인증 및 권한 확인 ---
    const session = await getServerSession(authOptions);

    // 🔍 [디버깅용 로그] 실제 세션에 들어있는 역할이 무엇인지 확인합니다.
    console.log(
      '[DEBUG /api/wheelchairs] 22현재 로그인 세션 정보:',
      session?.user
    );

    const userRole = (session?.user?.role as string) || '';

    // ‼️ [수정] 'DEVICE' 뿐만 아니라 'DEVICE_USER'도 허용하도록 변경
    if (
      !session ||
      !session.user ||
      !['ADMIN', 'MASTER', 'DEVICE', 'DEVICE_USER'].includes(userRole)
    ) {
      console.log(`[DEBUG] 🚨 접근 거부됨 (Role: ${userRole})`);
      return NextResponse.json(
        { error: 'Unauthorized: 접근 권한이 없습니다.' },
        { status: 401 }
      );
    }

    // --- 2. DB 연결 ---
    await connectDatabase();
    const wheelchairRepo: Repository<Wheelchair> =
      AppDataSource.getRepository(Wheelchair);

    let rawWheelchairs: Wheelchair[] = [];

    // --- 3. 권한별 조회 로직 분기 ---

    // ✅ CASE A: 기기(DEVICE 또는 DEVICE_USER)로 로그인한 경우
    if (userRole === 'DEVICE' || userRole === 'DEVICE_USER') {
      const myDeviceId = session.user.dbUserId;
      console.log(`[DEBUG] 기기 로그인 확인됨. ID: ${myDeviceId}`);

      const myWheelchair = await wheelchairRepo.findOne({
        where: {
          // 현재 로그인한 DeviceAuth ID와 연결된 휠체어 찾기
          deviceAuth: { id: myDeviceId },
        },
        relations: ['registeredBy', 'deviceAuth', 'status'],
      });

      rawWheelchairs = myWheelchair ? [myWheelchair] : [];
      console.log(`[DEBUG] 조회된 휠체어 수: ${rawWheelchairs.length}`);
    }

    // ✅ CASE B: 관리자(ADMIN/MASTER)인 경우 -> 전체 조회
    else {
      rawWheelchairs = await wheelchairRepo.find({
        relations: ['registeredBy', 'deviceAuth', 'status'],
        order: { createdAt: 'DESC' },
      });
    }

    // --- 4. 데이터 매핑 (TypeORM Entity -> Frontend Type) ---
    const wheelchairsData: DashboardWheelchair[] = rawWheelchairs.map(
      (wheelchair) => {
        const userEntity = wheelchair.registeredBy
          ? {
              id: wheelchair.registeredBy.id,
              name: wheelchair.registeredBy.name,
              email: wheelchair.registeredBy.email,
              nickname: wheelchair.registeredBy.name,
            }
          : null;

        return {
          ...wheelchair,
          deviceId: wheelchair.deviceAuth?.deviceId || null,
          users: userEntity ? [userEntity] : [],
        };
      }
    );

    return NextResponse.json(wheelchairsData);
  } catch (error: unknown) {
    let errorMessage = 'Internal Server Error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error(
      '[API /wheelchairs] GET 요청 처리 실패:',
      errorMessage,
      error
    );
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
