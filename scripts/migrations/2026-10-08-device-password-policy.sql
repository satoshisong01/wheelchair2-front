-- 📍 경로: scripts/migrations/2026-10-08-device-password-policy.sql
-- 🔒 [uc_auth_04 / REM-RT-bbdd9868] 기기 계정 초기 비밀번호 강제 변경 + DB 차원의 평문 비밀번호 저장 차단
--   1) device_auths.must_change_password  : 첫 로그인 때 비밀번호를 바꿔야 하는 계정(신규 등록 기기만 true로 INSERT)
--   2) device_auths.password_changed_at   : 마지막 비밀번호 변경 시각(변경 API가 기록)
--   3) password 칸 bcrypt 형식 CHECK       : 평문이 저장되려 하면 DB가 거부
--
-- 적용: 운영 DB 스냅샷 후 1회 실행. 재실행해도 안전(IF NOT EXISTS / 제약 존재·위반 행 사전 점검).
--       device_auths에 잠깐 테이블 잠금이 걸리므로(행 수가 적어 수 ms) 로그인이 적은 시간에 실행 권장.
-- 기존 계정: 새 컬럼 기본값 false → 기존 기기·KTC 테스트 계정(ktc-admin-test, sks8982)의 로그인 흐름은 그대로.
--           (기존 계정에 강제 변경을 걸지는 이 파일에서 하지 않음 — 필요 시 별도 UPDATE로 대상만 지정)
-- 순서: 이 SQL 적용 → 웹 배포 권장.
--       (SQL 없이 웹이 먼저 배포돼도 로그인·비밀번호 변경·기기 등록은 정상 동작하고, 신규 기기 강제 변경만 적용되지 않는다)
--
-- 사전 점검(읽기 전용) — 아래 결과가 0이면 3)의 CHECK 제약이 추가된다
--   SELECT count(*) AS non_bcrypt
--     FROM device_auths
--    WHERE password IS NULL OR password !~ '^[$]2[aby][$][0-9]{2}[$][./A-Za-z0-9]{53}$';
-- 확인:
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns WHERE table_name = 'device_auths' ORDER BY ordinal_position;
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'device_auths'::regclass;

SET client_encoding = 'UTF8';

-- lock_timeout: 잠금을 3초 안에 못 얻으면 오류로 끝냄 — 열린 트랜잭션 뒤에서 무기한 기다리며 뒤따르는
--   device_auths 조회(워커 FCM 대상 조회·기기 로그인)까지 줄 세우지 않게. 실패하면 ROLLBACK 후 다시 실행
BEGIN;
SET LOCAL lock_timeout = '3s';

-- 1)·2) 컬럼 추가 (상수 기본값이라 테이블 재작성 없음)
ALTER TABLE device_auths ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE device_auths ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- 3) bcrypt 형식 CHECK — 이미 있으면 건너뛰고, 형식이 아닌 행이 하나라도 있으면 추가하지 않고 경고만 남긴다
DO $migration$
DECLARE
  bad_rows integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'device_auths_password_bcrypt_chk'
       AND conrelid = 'device_auths'::regclass
  ) THEN
    RAISE NOTICE 'device_auths_password_bcrypt_chk 제약이 이미 있어 건너뜀';
    RETURN;
  END IF;

  SELECT count(*) INTO bad_rows
    FROM device_auths
   WHERE password IS NULL OR password !~ '^[$]2[aby][$][0-9]{2}[$][./A-Za-z0-9]{53}$';

  IF bad_rows > 0 THEN
    RAISE WARNING 'bcrypt 형식이 아닌 비밀번호 % 건 — CHECK 제약을 추가하지 않음(해당 행 정리 후 재실행)', bad_rows;
  ELSE
    ALTER TABLE device_auths
      ADD CONSTRAINT device_auths_password_bcrypt_chk
      CHECK (password ~ '^[$]2[aby][$][0-9]{2}[$][./A-Za-z0-9]{53}$');
    RAISE NOTICE 'device_auths_password_bcrypt_chk 제약 추가 완료';
  END IF;
END
$migration$;

COMMIT;

-- 되돌리기(rollback) — 웹은 컬럼이 없어도 동작하므로(강제 변경만 꺼짐) 웹 롤백 없이 실행 가능
-- BEGIN;
-- SET LOCAL lock_timeout = '3s';
-- ALTER TABLE device_auths DROP CONSTRAINT IF EXISTS device_auths_password_bcrypt_chk;
-- ALTER TABLE device_auths DROP COLUMN IF EXISTS password_changed_at;
-- ALTER TABLE device_auths DROP COLUMN IF EXISTS must_change_password;
-- COMMIT;
