-- 휠체어 관제 시스템 데이터베이스 초기화 스크립트
-- PostgreSQL용

-- 기본 Status 데이터 삽입
INSERT INTO statuses (status_name) VALUES
  ('정상'),
  ('충전중'),
  ('이동중'),
  ('정지'),
  ('오류'),
  ('점검중')
ON CONFLICT DO NOTHING;

-- 기본 Role 데이터 삽입
INSERT INTO roles (role_name, can_view_battery, can_view_alerts, can_view_location, can_view_medical_info) VALUES
  ('user', true, true, true, false),
  ('admin', true, true, true, true),
  ('manager', true, true, true, false)
ON CONFLICT DO NOTHING;

-- 테스트 데이터 (선택사항)
-- INSERT INTO users (kakao_id, email, nickname, role_id) VALUES
--   ('test_kakao_001', 'test@example.com', '테스트 사용자', 1);







