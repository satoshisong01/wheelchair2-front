import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { AppDataSource, connectDatabase } from '@/lib/db';
import { MaintenanceLog } from '@/entities/MaintenanceLog';
import { UserWheelchair } from '@/entities/UserWheelchair';
import { Wheelchair } from '@/entities/Wheelchair';

// [수정] context 타입은 간단하게 유지
interface MaintenanceApiContext {
  params: {
    wheelchairId: string;
  };
}

/**
 * GET: 특정 휠체어의 모든 정비 이력 조회
 */
export async function GET(request: Request, context: MaintenanceApiContext) {
  // 🔽🔽🔽 [수정] params를 await로 꺼냅니다. 🔽🔽🔽
  // Next.js 16+ (App Router)는 params를 Promise로 전달할 수 있습니다.
  const params = await context.params;
  // 🔼🔼🔼 [수정] 🔼🔼🔼

  try {
    // 1. 사용자 인증
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.role) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id: userId, role } = session.user;

    // [수정] 이제 params.wheelchairId가 정상적으로 작동합니다.
    const wheelchairId = parseInt(params.wheelchairId, 10);
    if (isNaN(wheelchairId)) {
      return NextResponse.json(
        { error: 'Invalid wheelchair ID' },
        { status: 400 }
      );
    }

    // 2. [권한 확인] Admin이 아니면, 본인 소유의 휠체어인지 확인
    if (role !== 'admin') {
      await connectDatabase();
      const link = await AppDataSource.getRepository(UserWheelchair).findOneBy({
        userId: userId,
        wheelchairId: wheelchairId,
      });
      if (!link) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // 3. DB에서 정비 이력 조회
    await connectDatabase();
    const logRepository = AppDataSource.getRepository(MaintenanceLog);
    const logs = await logRepository.find({
      where: { wheelchair: { id: wheelchairId } },
      order: {
        reportDate: 'DESC', // 최근 날짜부터 정렬
      },
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error(
      `[API /maintenance/${params.wheelchairId}] GET Error:`,
      error
    );
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST: 특정 휠체어에 새 정비 이력 추가 (Admin 전용)
 */
export async function POST(request: Request, context: MaintenanceApiContext) {
  // 🔽🔽🔽 [수정] params를 await로 꺼냅니다. 🔽🔽🔽
  const params = await context.params;
  // 🔼🔼🔼 [수정] 🔼🔼🔼

  try {
    // 1. 사용자 인증 (Admin만 허용)
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: Admin required' },
        { status: 403 }
      );
    }

    // [수정] 이제 params.wheelchairId가 정상적으로 작동합니다.
    const wheelchairId = parseInt(params.wheelchairId, 10);
    if (isNaN(wheelchairId)) {
      return NextResponse.json(
        { error: 'Invalid wheelchair ID' },
        { status: 400 }
      );
    }

    // 2. 요청 Body 파싱
    const body = await request.json();
    const { reportDate, description, technician } = body;

    // 3. 필수 값 검증
    if (!reportDate || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: reportDate and description' },
        { status: 400 }
      );
    }

    // 4. DB 연결 및 휠체어 존재 여부 확인
    await connectDatabase();
    const wheelchairRepo = AppDataSource.getRepository(Wheelchair);
    const wheelchairExists = await wheelchairRepo.findOneBy({
      id: wheelchairId,
    });
    if (!wheelchairExists) {
      return NextResponse.json(
        { error: 'Wheelchair not found' },
        { status: 404 }
      );
    }

    // 5. 새 로그 생성 및 저장
    const logRepository = AppDataSource.getRepository(MaintenanceLog);
    const newLog = logRepository.create({
      reportDate: new Date(reportDate),
      description,
      technician: technician || null,
      wheelchair: { id: wheelchairId }, // 관계 설정
    });

    await logRepository.save(newLog);

    return NextResponse.json(newLog, { status: 201 }); // 201 Created
  } catch (error) {
    console.error(
      `[API /maintenance/${params.wheelchairId}] POST Error:`,
      error
    );
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
