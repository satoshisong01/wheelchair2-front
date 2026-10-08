//  app/api/admin/devices/route.ts

import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { getServerSession } from 'next-auth';
import { authOptions, auditAccessDenied } from '@/lib/authOptions';
import { query, default as pool } from '@/lib/db';
import bcrypt from 'bcrypt';
import { createAuditLog } from '@/lib/log'; // ⭐️ 감사 로그 임포트
import { validatePassword, PASSWORD_POLICY_MESSAGE, BCRYPT_COST } from '@/lib/password'; // 🔒 [IA-05] 비밀번호 강도 검증
import { logServerError, summarizeError } from '@/lib/server-log';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/validate';

// 🔒 [입력 검증] 시리얼은 통계·각도 API와 같은 문자셋(영숫자·_·-, 64자 이내)만 등록 허용
const SERIAL_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
// 기기 로그인 ID에 공백·제어문자 금지(로그인 시 그대로 입력해야 하므로)
const DEVICE_ID_PATTERN = /^[^\s\u0000-\u001f\u007f]+$/;
const MIN_WEIGHT_KG = 1;
const MAX_WEIGHT_KG = 300;

// 사용자 몸무게: 빈 값이면 null, 아니면 1~300kg 숫자 (형식이 틀리면 undefined)
function parseWeight(value: string | number | null | undefined): number | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) && num >= MIN_WEIGHT_KG && num <= MAX_WEIGHT_KG ? num : undefined;
}

// 🔒 [uc_auth_04] device_auths.must_change_password 컬럼(2026-10-08 마이그레이션) 적용 여부.
//    적용 전 DB에서도 등록이 깨지지 않게 확인한 뒤 INSERT 형태를 고른다
async function hasMustChangePasswordColumn(client: PoolClient): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'device_auths' AND column_name = 'must_change_password'`,
  );
  return (res.rowCount ?? 0) > 0;
}

// ------------------------------
// GET: 휠체어/기기 목록 조회 (ADMIN/MASTER 전용)
// ------------------------------
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (
    !session ||
    (session.user.role !== 'MASTER' && session.user.role !== 'ADMIN')
  ) {
    return NextResponse.json(
      { message: '접근 권한이 없습니다.' },
      { status: 403 }
    );
  }

  try {
    // ⭐️ SQL FIX: registrant_user_id를 기준으로 users 테이블을 조인하여 등록자 이름을 가져옵니다.
    //    push_emergency / push_battery / push_posture 도 포함 (관리자 토글용)
    const sql = `
            SELECT
                w.id, w.device_serial, w.model_name, w.status, w.created_at,
                w.user_gender, w.user_weight,
                d.device_id,
                d.push_emergency,
                d.push_battery,
                d.push_posture,
                u.name AS registered_by_name,
                u.email AS registered_by_email
            FROM wheelchairs w
            LEFT JOIN device_auths d ON w.id = d.wheelchair_id
            LEFT JOIN users u ON w.registrant_user_id = u.id -- ⭐️ 등록자 FK 사용
            ORDER BY w.created_at DESC
        `;
    const result = await query(sql);

    // Raw SQL 결과는 snake_case이며, UI에서 요구하는 registered_by_name 등을 포함합니다.
    return NextResponse.json(result.rows);
  } catch (error) {
    logServerError('Error fetching device list', error);
    return NextResponse.json(
      { message: '장치 목록을 불러오는 데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// ------------------------------
// POST: 새 휠체어/기기 등록 (ADMIN/MASTER 전용)
// ------------------------------
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id; // 현재 로그인된 관리자 ID
  const userRole = session?.user?.role;

  if (!session || (userRole !== 'MASTER' && userRole !== 'ADMIN')) {
    await auditAccessDenied(session?.user, 'DEVICE_REGISTER');
    return NextResponse.json(
      { message: '접근 권한이 없습니다.' },
      { status: 403 }
    );
  }

  const parsed = await parseJsonBody(
    req,
    z.object({
      deviceSerial: z.string().min(1).max(100),
      deviceId: z.string().min(1).max(100),
      password: z.string().min(1).max(200),
      modelName: z.string().max(200).nullish(),
      userGender: z.string().max(50).nullish(),
      userWeight: z.union([z.string().max(20), z.number()]).nullish(),
    }),
    '필수 필드가 누락되었습니다.',
  );
  if ('error' in parsed) return parsed.error;
  const { deviceSerial, deviceId, password, modelName, userGender, userWeight } =
    parsed.data;

  if (!SERIAL_PATTERN.test(deviceSerial)) {
    return NextResponse.json(
      { message: '기기 시리얼은 영문·숫자·-·_ 조합 64자 이내로 입력해주세요.' },
      { status: 400 }
    );
  }
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    return NextResponse.json(
      { message: '기기 로그인 ID에는 공백을 넣을 수 없습니다.' },
      { status: 400 }
    );
  }
  const weightNum = parseWeight(userWeight);
  if (weightNum === undefined) {
    return NextResponse.json(
      { message: `사용자 몸무게는 ${MIN_WEIGHT_KG}~${MAX_WEIGHT_KG}kg 범위의 숫자로 입력해주세요.` },
      { status: 400 }
    );
  }

  // 🔒 [IA-05] 기기 비밀번호 강도 검증 (거부 시 어떤 규칙인지 드러내지 않는 단일 문구)
  if (!validatePassword(password).ok) {
    return NextResponse.json({ message: PASSWORD_POLICY_MESSAGE }, { status: 400 });
  }

  // 비밀번호 해시
  const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

  let registered: {
    wheelchairId: string;
    notifications: { push_emergency: boolean; push_battery: boolean; push_posture: boolean };
  } | null = null;
  let failure: unknown = null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // 트랜잭션 시작

    // 1. Wheelchair 테이블에 새 장치 정보, 등록자 ID, 사용자 성별·몸무게 삽입
    const insertWheelchairSql = `
            INSERT INTO wheelchairs (device_serial, model_name, registrant_user_id, user_gender, user_weight)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
        `;
    const wheelchairResult = await client.query(insertWheelchairSql, [
      deviceSerial,
      modelName || null,
      userId,
      userGender && (userGender === 'M' || userGender === 'F') ? userGender : null,
      weightNum,
    ]);
    const wheelchairId = wheelchairResult.rows[0].id;

    // 2. DeviceAuth 테이블에 로그인 정보 삽입
    //    알림 설정 3종은 DB 기본값을 사용하며, 초기 상태를 감사 로그로 남기기 위해 RETURNING으로 회수
    //    🔒 [uc_auth_04] 신규 기기는 첫 로그인 때 초기 비밀번호를 바꿔야 서비스를 쓸 수 있게 플래그를 켠다
    const mustChangeSupported = await hasMustChangePasswordColumn(client);
    if (!mustChangeSupported) {
      console.warn('[device-register] must_change_password 컬럼 없음 — 2026-10-08 마이그레이션 적용 필요');
    }
    const insertDeviceAuthSql = mustChangeSupported
      ? `
            INSERT INTO device_auths (device_id, password, wheelchair_id, must_change_password)
            VALUES ($1, $2, $3, true)
            RETURNING push_emergency, push_battery, push_posture;
        `
      : `
            INSERT INTO device_auths (device_id, password, wheelchair_id)
            VALUES ($1, $2, $3)
            RETURNING push_emergency, push_battery, push_posture;
        `;
    const deviceAuthResult = await client.query(insertDeviceAuthSql, [
      deviceId,
      hashedPassword,
      wheelchairId,
    ]);

    // 3. User-Wheelchair 연결 테이블에도 현재 유저 연결 (N:M 관계)
    const insertUserWheelchairSql = `
            INSERT INTO user_wheelchairs (user_id, wheelchair_id)
            VALUES ($1, $2);
        `;
    await client.query(insertUserWheelchairSql, [userId, wheelchairId]);

    await client.query('COMMIT'); // 트랜잭션 종료 및 저장
    registered = { wheelchairId, notifications: deviceAuthResult.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {}); // 오류 발생 시 롤백
    failure = error;
  } finally {
    client.release();
  }

  // 감사 로그는 연결 반납 후 기록 (공용 풀 중첩 대기 방지)
  if (!registered) {
    const { name, code } = summarizeError(failure);
    await createAuditLog({
      userId,
      userRole,
      action: 'DEVICE_REGISTER_FAILED',
      details: { serial: deviceSerial, status: 'Failed', errorCode: code ?? name },
    });
    if (code === '23505') {
      // PostgreSQL unique violation code
      return NextResponse.json(
        { message: '이미 존재하는 시리얼 번호 또는 기기 ID입니다.' },
        { status: 409 }
      );
    }
    logServerError('Device registration failed', failure);
    return NextResponse.json(
      { message: '장치 등록에 실패했습니다.' },
      { status: 500 }
    );
  }

  // ⭐️ [LOG INJECTION] 기기 생성 로그 기록
  await createAuditLog({
    userId,
    userRole,
    action: 'DEVICE_REGISTER',
    details: { serial: deviceSerial, wcId: registered.wheelchairId, model: modelName },
  });

  // 알림 설정 초기 상태 로그 — 이후 DEVICE_NOTIFICATION_TOGGLE 이력과 합치면
  // 등록 시점부터 각 알림(자세/응급/배터리)의 ON/OFF 이력을 완전히 복원 가능
  await createAuditLog({
    userId,
    userRole,
    action: 'DEVICE_NOTIFICATION_INIT',
    details: {
      wheelchairId: registered.wheelchairId,
      emergency: registered.notifications.push_emergency,
      battery: registered.notifications.push_battery,
      posture: registered.notifications.push_posture,
    },
  });

  return NextResponse.json({
    message: '장치 및 계정이 성공적으로 등록되었습니다.',
  });
}

// ------------------------------
// DELETE: 휠체어/기기 삭제 (ADMIN/MASTER — MASTER 전용 제한 여부는 운영 정책 결정 대기)
// ------------------------------
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userRole = session?.user?.role;
  const userId = session?.user?.id;

  if (!session || (userRole !== 'MASTER' && userRole !== 'ADMIN')) {
    await auditAccessDenied(session?.user, 'DEVICE_DELETE');
    return NextResponse.json(
      { message: '접근 권한이 없습니다.' },
      { status: 403 }
    );
  }

  const parsed = await parseJsonBody(
    req,
    z.object({
      wheelchairId: z.string().min(1).max(100),
    }),
    '휠체어 ID가 필요합니다.',
  );
  if ('error' in parsed) return parsed.error;
  const { wheelchairId } = parsed.data;

  let deleted: { serial: string; model: string } | null = null;
  let failure: unknown = null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. 삭제 전 시리얼/모델 조회 (감사 로그용)
    const lookupSql = `SELECT device_serial, model_name FROM wheelchairs WHERE id = $1`;
    const lookupResult = await client.query(lookupSql, [wheelchairId]);

    if (lookupResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { message: '해당 휠체어를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const serial = lookupResult.rows[0].device_serial;
    const model = lookupResult.rows[0].model_name;

    // 2. wheelchairs를 참조하는 모든 테이블을 pg_constraint에서 동적 조회
    //    하드코딩된 테이블 목록 의존을 제거하여 신규 테이블 추가에도 자동 대응
    const fkLookup = await client.query(`
      SELECT
        cl.relname AS table_name,
        att.attname AS column_name
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_class cl_ref ON cl_ref.oid = con.confrelid
      JOIN pg_attribute att
        ON att.attrelid = con.conrelid
       AND att.attnum = ANY(con.conkey)
      WHERE con.contype = 'f'
        AND cl_ref.relname = 'wheelchairs'
    `);

    // 3. 발견된 모든 참조 테이블에서 해당 wheelchair_id 행 삭제
    for (const fk of fkLookup.rows) {
      const tbl = fk.table_name as string;
      const col = fk.column_name as string;
      // SQL injection 방지: 식별자 안전성 검증
      if (!/^[a-z_][a-z0-9_]*$/i.test(tbl) || !/^[a-z_][a-z0-9_]*$/i.test(col)) {
        continue;
      }
      await client.query(
        `DELETE FROM "${tbl}" WHERE "${col}" = $1`,
        [wheelchairId]
      );
    }

    // 3. 휠체어 본 테이블 삭제
    const result = await client.query(
      `DELETE FROM wheelchairs WHERE id = $1`,
      [wheelchairId]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { message: '해당 휠체어를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    await client.query('COMMIT');
    deleted = { serial, model };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    failure = error;
  } finally {
    client.release();
  }

  // 4. 감사 로그 — 연결 반납 후 기록 (공용 풀 중첩 대기 방지)
  if (!deleted) {
    const { name, code } = summarizeError(failure);
    await createAuditLog({
      userId,
      userRole,
      action: 'DEVICE_DELETE_FAILED',
      details: { wheelchairId, status: 'Failed', errorCode: code ?? name },
    });
    logServerError('Device deletion failed', failure);
    return NextResponse.json(
      { message: '장치 삭제에 실패했습니다.' },
      { status: 500 }
    );
  }

  await createAuditLog({
    userId,
    userRole,
    action: 'DEVICE_DELETE',
    details: { wheelchairId, serial: deleted.serial, model: deleted.model },
  });

  return NextResponse.json({
    message: `장치 (${deleted.serial})가 성공적으로 삭제되었습니다.`,
  });
}
