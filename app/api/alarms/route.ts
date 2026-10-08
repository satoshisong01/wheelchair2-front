import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { query } from '@/lib/db';
import { AlarmCategory, CRITICAL_ALARM_KEYWORDS } from '@/lib/alarm-categories';
import { logServerError } from '@/lib/server-log';

// 선택 쿼리 파라미터는 화이트리스트 검증 후 플레이스홀더로만 SQL에 전달
const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_LIMIT = 1000;
const CRITICAL_LIKE_PATTERNS = CRITICAL_ALARM_KEYWORDS.map((keyword) => `%${keyword}%`);

type AlarmFilters = {
  wheelchairId: string | null;
  category: AlarmCategory | null;
  limit: number | null;
};

function parseFilters(searchParams: URLSearchParams): AlarmFilters | { error: string } {
  const wheelchairId = searchParams.get('wheelchairId');
  if (wheelchairId !== null && !UUID_REGEX.test(wheelchairId)) {
    return { error: 'wheelchairId 형식이 올바르지 않습니다.' };
  }

  const categoryParam = searchParams.get('category');
  const category = categoryParam === 'critical' || categoryParam === 'info' ? categoryParam : null;
  if (categoryParam !== null && category === null) {
    return { error: 'category는 critical 또는 info만 가능합니다.' };
  }

  const limitParam = searchParams.get('limit');
  let limit: number | null = null;
  if (limitParam !== null) {
    limit = Number(limitParam);
    if (!/^\d+$/.test(limitParam) || limit < 1 || limit > MAX_LIMIT) {
      return { error: `limit은 1~${MAX_LIMIT} 사이의 정수여야 합니다.` };
    }
  }

  return { wheelchairId, category, limit };
}

// paramOffset: 앞에서 이미 쓰는 플레이스홀더 개수 (일반 사용자는 $1이 userId)
function buildFilterSql(filters: AlarmFilters, paramOffset: number) {
  const params: unknown[] = [];
  const placeholder = (value: unknown) => {
    params.push(value);
    return `$${paramOffset + params.length}`;
  };

  const conditions: string[] = [];
  if (filters.wheelchairId) {
    conditions.push(`a.wheelchair_id = ${placeholder(filters.wheelchairId)}`);
  }
  if (filters.category) {
    // NULL 유형도 클라이언트처럼 알림으로 분류되도록 COALESCE
    const patterns = placeholder(CRITICAL_LIKE_PATTERNS);
    const isCritical = `COALESCE(a.alarm_type, '') LIKE ANY(${patterns}::text[])`;
    conditions.push(filters.category === 'critical' ? isCritical : `NOT (${isCritical})`);
  }
  const limitSql = filters.limit === null ? '' : ` LIMIT ${placeholder(filters.limit)}`;

  return { params, condition: conditions.join(' AND '), limitSql };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  // @ts-ignore
  const userId = session?.user?.id;
  // @ts-ignore
  const userRole = session?.user?.role;

  if (!userId) {
    return NextResponse.json(
      { message: '인증되지 않은 사용자입니다.' },
      { status: 401 }
    );
  }

  const filters = parseFilters(request.nextUrl.searchParams);
  if ('error' in filters) {
    return NextResponse.json({ message: filters.error }, { status: 400 });
  }

  try {
    let sql: string;
    let params: any[] = [];

    // ⭐️ [핵심 수정 1] "최근 24시간" 조건 추가 (NOW() - INTERVAL '24 HOURS')
    // ⭐️ [핵심 수정 2] Worker가 저장한 실제 DB 컬럼명(snake_case)을
    //                 프론트엔드 변수명(camelCase)으로 매핑 (AS 사용)

    if (userRole === 'ADMIN' || userRole === 'MASTER') {
      // ✅ CASE 1: 전체 관리자
      const filter = buildFilterSql(filters, 0);
      const whereSql = filter.condition ? ` WHERE ${filter.condition}` : '';
      sql = `
                SELECT 
                    a.id, 
                    a.wheelchair_id as "wheelchairId",
                    a.alarm_type as "alarmType", 
                    a.alarm_condition as "message", 
                    a.alarm_status as "alarmStatus", 
                    a.alarm_time as "alarmTime", 
                    w.device_serial as "deviceSerial"
                FROM alarms a
                JOIN wheelchairs w ON a.wheelchair_id = w.id${whereSql}
                ORDER BY a.alarm_time DESC${filter.limitSql}
            `;
      params = filter.params;
    } else {
      // ✅ CASE 2: 일반 사용자 (본인 기기만)
      const filter = buildFilterSql(filters, 1);
      const andSql = filter.condition ? `AND ${filter.condition} ` : '';
      sql = `
                SELECT 
                    a.id, 
                    a.wheelchair_id as "wheelchairId",
                    a.alarm_type as "alarmType", 
                    a.alarm_condition as "message", 
                    a.alarm_status as "alarmStatus", 
                    a.alarm_time as "alarmTime", 
                    w.device_serial as "deviceSerial"
                FROM alarms a
                JOIN user_wheelchairs uw ON a.wheelchair_id = uw.wheelchair_id
                JOIN wheelchairs w ON a.wheelchair_id = w.id
                WHERE uw.user_id = $1 ${andSql}
                ORDER BY a.alarm_time DESC${filter.limitSql}
            `;
      params = [userId, ...filter.params];
    }

    const result = await query(sql, params);

    return NextResponse.json(result.rows);
  } catch (error) {
    logServerError('Alarm API Failed', error);
    return NextResponse.json(
      { message: '알림 목록 로딩 실패' },
      { status: 500 }
    );
  }
}
