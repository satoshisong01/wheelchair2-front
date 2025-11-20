// 📍 경로: app/api/admin/audit-log/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { AppDataSource, connectDatabase } from '@/lib/db';
import { AdminAuditLog } from '@/entities/AdminAuditLog';
import { Between, Repository } from 'typeorm';

/**
 * [GET] /api/admin/audit-log
 * (MASTER 전용) 모든 관리자 활동 로그를 조회합니다.
 * 🟢 [기능] startDate, endDate, sort 쿼리 파라미터를 받아 필터링 및 정렬 수행
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);

    // 1. 세션 확인 (MASTER인지)
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'MASTER') {
      return NextResponse.json(
        { message: '접근 권한이 없습니다.' },
        { status: 403 }
      );
    }

    // 2. DB 연결 및 파라미터 추출
    await connectDatabase();
    const LogRepo: Repository<AdminAuditLog> =
      AppDataSource.getRepository(AdminAuditLog);

    const startDateParam = url.searchParams.get('startDate');
    const endDateParam = url.searchParams.get('endDate');

    // 🟢 [추가] 정렬 파라미터 추출 (기본값은 DESC)
    const sortParam = url.searchParams.get('sort'); // 'ASC' or 'DESC'

    // 3. 기간 필터링 조건 생성
    const where: any = {};
    if (startDateParam && endDateParam) {
      const startOfDay = new Date(startDateParam);
      const endDay = new Date(endDateParam);

      // 종료일의 23:59:59.999까지 포함하도록 설정
      endDay.setDate(endDay.getDate() + 1);
      const endOfDay = new Date(endDay.getTime() - 1);

      where.timestamp = Between(startOfDay, endOfDay);
    }

    // 4. 정렬 순서 결정
    // 🟢 [추가] 프론트에서 'ASC'를 보냈으면 오름차순(과거순), 아니면 내림차순(최신순)
    // (TypeORM의 FindOptionsOrderValue 타입에 맞추기 위해 삼항 연산자 사용)
    const sortOrder: 'ASC' | 'DESC' = sortParam === 'ASC' ? 'ASC' : 'DESC';

    // 5. 로그 조회
    const logs = await LogRepo.find({
      where: where,
      relations: {
        adminUser: true,
      },
      select: {
        id: true,
        timestamp: true,
        actionType: true,
        details: true,
        adminUserId: true,
        adminUser: {
          id: true,
          name: true,
          email: true,
        },
      },
      // 🟢 [적용] 동적 정렬 순서 적용
      order: {
        timestamp: sortOrder,
      },
    });

    return NextResponse.json(logs, { status: 200 });
  } catch (error) {
    console.error('[/api/admin/audit-log] GET 오류:', error);
    return NextResponse.json(
      { message: '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
