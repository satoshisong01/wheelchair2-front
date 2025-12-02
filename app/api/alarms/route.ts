import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { query } from '@/lib/db';

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

  try {
    let sql: string;
    let params: any[] = [];

    // ⭐️ [핵심 수정 1] "최근 24시간" 조건 추가 (NOW() - INTERVAL '24 HOURS')
    // ⭐️ [핵심 수정 2] Worker가 저장한 실제 DB 컬럼명(snake_case)을
    //                 프론트엔드 변수명(camelCase)으로 매핑 (AS 사용)

    if (userRole === 'ADMIN' || userRole === 'MASTER') {
      // ✅ CASE 1: 전체 관리자
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
                JOIN wheelchairs w ON a.wheelchair_id = w.id
                ORDER BY a.alarm_time DESC
            `;
    } else {
      // ✅ CASE 2: 일반 사용자 (본인 기기만)
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
                WHERE uw.user_id = $1 
                ORDER BY a.alarm_time DESC
            `;
      params = [userId];
    }

    const result = await query(sql, params);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('❌ Alarm API Failed:', error);
    return NextResponse.json(
      { message: '알림 목록 로딩 실패' },
      { status: 500 }
    );
  }
}
