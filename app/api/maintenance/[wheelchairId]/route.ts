// app/api/maintenance/[wheelchairId]/route.ts
// 📝 설명: TypeORM 제거, Raw SQL 적용, UUID 호환, 권한 체크 로직 이식 완료

import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getServerSession } from 'next-auth';
// 🚨 authOptions 경로 확인 (lib/authOptions 또는 app/api/auth/[...nextauth]/route)
import { authOptions } from '@/lib/authOptions';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // RDS 연결 필수
});

interface RouteParams {
  params: Promise<{ wheelchairId: string }>;
}

// 1. 조회 (GET)
export async function GET(request: Request, { params }: RouteParams) {
  try {
    // Next.js 15+ 대응: params await
    const { wheelchairId } = await params;

    // 1. 사용자 인증
    const session = await getServerSession(authOptions);
    if (!session?.user?.dbUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.dbUserId;
    const userRole = session.user.role;

    // 🚨 [변경] UUID 사용 (parseInt 제거)
    // 간단한 유효성 검사 (빈 문자열 체크 정도)
    if (!wheelchairId) {
      return NextResponse.json(
        { error: 'Invalid wheelchair ID' },
        { status: 400 }
      );
    }

    // 2. [권한 확인] Admin이 아니면, 본인 소유인지 확인 (user_wheelchair 테이블 조회)
    if (userRole !== 'ADMIN' && userRole !== 'MASTER') {
      const checkQuery = `
        SELECT 1 FROM user_wheelchair 
        WHERE user_id = $1 AND wheelchair_id = $2
      `;
      const checkResult = await pool.query(checkQuery, [userId, wheelchairId]);

      if (checkResult.rowCount === 0) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // 3. 정비 이력 조회
    // DB 컬럼(snake_case)을 JS 객체(camelCase)로 변환하여 조회
    const query = `
      SELECT 
        id, 
        report_date as "reportDate", 
        description, 
        technician, 
        created_at as "createdAt"
      FROM maintenance_logs
      WHERE wheelchair_id = $1
      ORDER BY report_date DESC
    `;

    const result = await pool.query(query, [wheelchairId]);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(`[API /maintenance/GET] Error:`, error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// 2. 추가 (POST) - 관리자 전용
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { wheelchairId } = await params;

    // 1. 사용자 인증 (ADMIN/MASTER 만 허용)
    const session = await getServerSession(authOptions);
    if (
      !session ||
      (session.user.role !== 'ADMIN' && session.user.role !== 'MASTER')
    ) {
      return NextResponse.json(
        { error: 'Forbidden: Admin required' },
        { status: 403 }
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

    // 4. 휠체어 존재 여부 확인
    const checkQuery = 'SELECT 1 FROM wheelchairs WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [wheelchairId]);

    if (checkResult.rowCount === 0) {
      return NextResponse.json(
        { error: 'Wheelchair not found' },
        { status: 404 }
      );
    }

    // 5. 정비 이력 저장 (maintenance_logs 테이블)
    const insertQuery = `
      INSERT INTO maintenance_logs (
        wheelchair_id, 
        report_date, 
        description, 
        technician, 
        created_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING 
        id, 
        report_date as "reportDate", 
        description, 
        technician, 
        created_at as "createdAt"
    `;

    const result = await pool.query(insertQuery, [
      wheelchairId,
      new Date(reportDate), // 날짜 객체로 변환
      description,
      technician || null,
    ]);

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error(`[API /maintenance/POST] Error:`, error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
