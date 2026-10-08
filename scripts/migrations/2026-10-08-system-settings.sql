-- 📍 경로: scripts/migrations/2026-10-08-system-settings.sql
-- 🔒 [uc_auth_11 / REM-RT-1f3d4676] 로그인 화면 시스템 사용 알림 배너를 MASTER가 설정할 수 있도록
--     설정 저장 테이블(system_settings)을 추가하고 현행 문구를 초기값으로 넣는다.
--
-- 적용: 운영 DB 스냅샷 후 1회 실행. 재실행해도 안전(IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- 순서: 이 SQL 적용 → 웹 배포 권장.
--       (SQL 없이 웹이 먼저 배포돼도 로그인 화면은 기본 문구로 정상 표시되고, MASTER 저장만 실패한다)
-- 확인: SELECT key, value, updated_by, updated_at FROM system_settings;

-- 아래 초기 문구(한글)가 깨지지 않도록 클라이언트 인코딩 고정
SET client_encoding = 'UTF8';

-- lock_timeout: 잠금을 3초 안에 못 얻으면 오류로 끝냄(무기한 대기 방지). 실패하면 ROLLBACK 후 다시 실행
BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS system_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT         NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 초기값: 현행 로그인 화면 문구 (lib/login-banner.ts DEFAULT_LOGIN_BANNER와 동일). 이미 있으면 유지
INSERT INTO system_settings (key, value, updated_by)
VALUES (
  'login_banner',
  '본 시스템은 인가된 사용자만 이용할 수 있습니다. 모든 접속 및 활동은 기록·모니터링되며, 무단 접근 시 관련 법령에 따라 책임을 물을 수 있습니다.',
  'SYSTEM-MIGRATION'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- 되돌리기(rollback) — 웹은 테이블이 없어도 기본 문구로 동작하므로 웹 롤백 없이 실행 가능
-- BEGIN;
-- SET LOCAL lock_timeout = '3s';
-- DROP TABLE IF EXISTS system_settings;
-- COMMIT;
