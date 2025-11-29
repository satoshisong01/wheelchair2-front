// app/api/admin/users/[id]/route.ts
// 📝 설명: TypeORM 제거, Raw SQL 적용, UUID 사용, 승인/거절 로직 이식 완료

import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions'; // 경로 확인 필수

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // RDS 연결 필수
});

// Next.js 15+ 대응
interface RouteParams {
  params: Promise<{ id: string }>;
}

// 1. 상세 조회 (GET)
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'MASTER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // 유저 정보 조회
    const query = `
      SELECT id, email, nickname, role, created_at, rejection_reason
      FROM users
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 프론트엔드 호환성을 위해 snake_case -> camelCase 변환
    const user = result.rows[0];
    return NextResponse.json({
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      createdAt: user.created_at,
      rejectionReason: user.rejection_reason,
    });
  } catch (error) {
    console.error('User Detail Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// 2. 역할 변경 (PATCH) - 승인/거절 로직 포함
export async function PATCH(request: Request, { params }: RouteParams) {
  const client = await pool.connect(); // 트랜잭션을 위해 클라이언트 연결
  try {
    const { id } = await params; // 타겟 유저 ID (UUID string)

    // 1. 세션 확인 (MASTER 권한 필수)
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'MASTER' || !session.user.dbUserId) {
      return NextResponse.json(
        { message: '접근 권한이 없습니다.' },
        { status: 403 }
      );
    }
    const masterAdminId = session.user.dbUserId; // 문자열 ID

    // 2. 요청 본문 파싱
    const { role, reason } = await request.json();

    let newRole = '';
    let logAction = ''; // DB에는 문자열로 저장
    let logDetails = '';

    // 승인 요청
    if (role === 'ADMIN') {
      newRole = 'ADMIN';
      logAction = 'ADMIN_APPROVE';
      logDetails = `MASTER(ID: ${masterAdminId})가 사용자(ID: ${id})를 승인했습니다.`;
    }
    // 거절 요청
    else if (role === 'REJECTED') {
      newRole = 'REJECTED';
      logAction = 'ADMIN_REJECT';
      logDetails = `MASTER(ID: ${masterAdminId})가 사용자(ID: ${id})를 거절했습니다. 사유: ${
        reason || '없음'
      }`;
    } else {
      return NextResponse.json(
        { message: '유효하지 않은 요청입니다.' },
        { status: 400 }
      );
    }

    // 3. 트랜잭션 시작
    await client.query('BEGIN');

    // (1) 사용자 업데이트
    // rejection_reason 컬럼이 users 테이블에 있어야 함
    const updateQuery = `
      UPDATE users 
      SET role = $1, rejection_reason = $2
      WHERE id = $3
      RETURNING id, role, rejection_reason
    `;

    // 승인이면 사유 null, 거절이면 사유 입력
    const reasonValue = role === 'REJECTED' ? reason : null;

    const updateResult = await client.query(updateQuery, [
      newRole,
      reasonValue,
      id,
    ]);

    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { message: '대상 사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // (2) 감사 로그 기록 (admin_audit_logs 테이블)
    // admin_user_id 컬럼 타입이 UUID라고 가정
    const insertLogQuery = `
      INSERT INTO admin_audit_logs (action_type, details, admin_user_id, created_at)
      VALUES ($1, $2, $3, NOW())
    `;
    await client.query(insertLogQuery, [logAction, logDetails, masterAdminId]);

    // 4. 트랜잭션 커밋
    await client.query('COMMIT');

    const updatedUser = updateResult.rows[0];
    return NextResponse.json(
      {
        success: true,
        user: {
          id: updatedUser.id,
          role: updatedUser.role,
          rejectionReason: updatedUser.rejection_reason,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error(`[/api/admin/users/ID] PATCH 오류:`, error);
    return NextResponse.json(
      { message: error.message || '서버 오류 발생' },
      { status: 500 }
    );
  } finally {
    client.release(); // 연결 해제 필수
  }
}

// 3. 삭제 (DELETE)
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'MASTER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return NextResponse.json(
        { message: '삭제할 사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 로그는 간단히 콘솔에만 (필요시 DB 저장 로직 추가 가능)
    console.log(`[Admin] User Deleted: ${id} by ${session.user.email}`);

    return NextResponse.json({ message: '사용자가 삭제되었습니다.' });
  } catch (error) {
    console.error('User Delete Error:', error);
    return NextResponse.json({ error: 'Delete Failed' }, { status: 500 });
  }
}
