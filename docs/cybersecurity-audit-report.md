# 스마트 휠체어 시스템 사이버보안 자체 점검 보고서

**작성일**: 2026-04-01
**프로젝트**: 스마트 휠체어 모니터링 시스템
**버전**: 1.5.0

---

## 1. 시스템 아키텍처 개요

### 1.1 구성 요소

| 구성 요소 | 기술 스택 | 배포 환경 |
|-----------|----------|----------|
| 웹 프론트엔드 | Next.js 16.x, React | Vercel (HTTPS) |
| 백엔드 워커 | Node.js, TypeScript | AWS EC2 (Ubuntu) |
| 데이터베이스 | PostgreSQL | AWS RDS (SSL) |
| 시계열 DB | AWS Timestream | AWS ap-northeast-2 |
| 통신 프로토콜 | MQTTS (TLS, 포트 8883) | EC2 브로커 |
| 실시간 통신 | Socket.io (WSS, 포트 8080) | EC2 |
| 푸시 알림 | Firebase Cloud Messaging | Google FCM |
| 모바일 앱 | React Native (Android) | APK 배포 |

### 1.2 데이터 흐름

```
휠체어 모뎀 --[MQTTS/TLS 8883]--> Worker(EC2)
    Worker --> PostgreSQL (SSL) : 실시간 상태 저장
    Worker --> AWS Timestream   : 시계열 데이터 저장
    Worker --[WSS 8080]-------> 웹/앱 클라이언트 : 실시간 업데이트
    Worker --[FCM]------------> 모바일 앱 : 푸시 알림
```

### 1.3 MQTT 토픽 정의

| 토픽 | 설명 | 데이터 형식 |
|------|------|------------|
| CW/st | 센서 상태 (각도, 거리) | CTN,{시리얼},A_BCK,{값},A_SEA,{값},... |
| CW/mt | 모터 상태 (전압, 속도, GPS) | CTN,{시리얼},VOL,{값},CUR,{값},SPD,{값},... |
| CW/lt | 환경 센서 (온도, 습도, 기압) | CTN,{시리얼},TMP,{값},HUM,{값},ATM,{값} |
| E_LOW | 배터리 부족 경고 | CTN,{시리얼},... |
| E_FALL | 낙상 감지 | CTN,{시리얼},LAT,{위도},LON,{경도} |
| E_OBS | 장애물 감지 | CTN,{시리얼},... |
| E_SLOPE | 급경사 감지 | CTN,{시리얼},... |
| E_ROV | 전복 감지 | CTN,{시리얼},... |
| E_PCA | 욕창 예방 자세 변경 권고 | CTN,{시리얼},PC |
| E_PUP | 욕창 예방 완료 | CTN,{시리얼},PU |

---

## 2. 보안 조치 현황 (자체 점검 완료 항목)

### 2.1 통신 보안

| 항목 | 구현 상태 | 상세 |
|------|----------|------|
| MQTT TLS 암호화 | O 완료 | 포트 8883, Let's Encrypt 인증서 적용 |
| WebSocket TLS | O 완료 | WSS(포트 8080), SSL 인증서 적용 |
| HTTPS | O 완료 | Vercel 자동 HTTPS, HSTS 헤더 적용 |
| DB 접속 SSL | O 완료 | AWS RDS SSL 연결 |

### 2.2 인증 및 접근 제어

| 항목 | 구현 상태 | 상세 |
|------|----------|------|
| 인증 방식 | O 완료 | NextAuth v4, JWT 전략 |
| 비밀번호 해싱 | O 완료 | Bcrypt (salt rounds: 10) |
| 세션 관리 | O 완료 | JWT, 만료 시간 3일 |
| 역할 기반 접근 제어 | O 완료 | MASTER / ADMIN / DEVICE_USER 3단계 |
| 미들웨어 인증 검사 | O 완료 | 보호된 경로 접근 시 토큰 검증 |
| 좀비 세션 감지 | O 완료 | DB에서 삭제된 사용자의 JWT 무효화 |

### 2.3 데이터 보호

| 항목 | 구현 상태 | 상세 |
|------|----------|------|
| 의료정보 암호화 | O 완료 | AES-256-CBC, Scrypt 키 파생 |
| SQL 인젝션 방지 | O 완료 | 모든 쿼리 파라미터화 ($1, $2, ...) |
| 환경변수 관리 | O 완료 | .env 파일 사용, .gitignore 등록 확인 |
| 비밀키 분리 | O 완료 | 소스코드에 하드코딩 없음 |

### 2.4 보안 헤더 (next.config.js)

| 헤더 | 값 | 목적 |
|------|---|------|
| X-Frame-Options | SAMEORIGIN | 클릭재킹 방지 |
| X-Content-Type-Options | nosniff | MIME 스니핑 방지 |
| Referrer-Policy | origin-when-cross-origin | 리퍼러 정보 제한 |
| Strict-Transport-Security | max-age=63072000 | HTTPS 강제 (HSTS) |

### 2.5 감사 로그

| 이벤트 | 기록 항목 |
|--------|----------|
| 로그인 성공 | 사용자 ID, IP, 시간 |
| 로그인 실패 | 시도 ID, IP, 시간 |
| 로그아웃 | 사용자 ID, 시간 |
| 비밀번호 변경 | 사용자 ID, 시간 |
| 기기 등록/삭제 | 관리자 ID, 대상 기기, 시간 |

### 2.6 의존성 취약점 관리

| 날짜 | 조치 | 결과 |
|------|------|------|
| 2026-04-01 | npm audit 실행 | 27개 취약점 발견 (1 critical, 23 high) |
| 2026-04-01 | npm audit fix 실행 | 취약점 0개로 해소 (프론트엔드) |
| 2026-04-01 | 서버 npm audit fix | 8개 low 잔존 (firebase-admin 의존성, 대응 불가) |
| 2026-04-01 | axios 버전 확인 | v1.13.4 (악성 버전 1.14.1, 0.30.4 해당 없음) |

---

## 3. 부하 테스트 결과

### 3.1 JMeter 테스트 (2026-04-01)

| 항목 | 결과 |
|------|------|
| 동시 사용자 수 | 1,000명 |
| 평균 응답 시간 | 122ms |
| 최소 응답 시간 | 103ms |
| 최대 응답 시간 | 340ms |
| 에러율 | 0.00% |
| 처리량 (Throughput) | 99.0 req/sec |

---

## 4. 추가 조치 필요 항목

### 4.1 보안 업체 진단 전 보완 권장 사항

| 우선순위 | 항목 | 현황 | 권장 조치 |
|---------|------|------|----------|
| 중 | Rate Limiting | 정의됨, 미적용 | API 라우트에 rate-limiter 미들웨어 적용 |
| 중 | 입력값 검증 | 기본 null 체크만 | Zod 스키마 검증 도입 (설치 완료, 미사용) |
| 중 | 일부 API 인증 누락 | logout, profile-submit | 세션 검증 추가 |
| 하 | DB SSL 검증 | rejectUnauthorized: false | true로 변경 권장 |
| 하 | CORS 명시적 설정 | Next.js 기본값 | 필요 시 화이트리스트 설정 |

### 4.2 Phase 2 (모의해킹) 대비 준비물

| 항목 | 상태 | 비고 |
|------|------|------|
| 테스트용 별도 서버 | 미준비 | 운영 환경 복제 EC2 필요 |
| 테스트 계정 (관리자) | 미준비 | MASTER 1개, ADMIN 1개, USER 2개 |
| 테스트 시뮬레이터 | 미준비 | MQTT 시뮬레이터 또는 모뎀 대여 |

### 4.3 Phase 3 (문서화) 인터뷰 대응 자료

| 예상 질문 | 답변 근거 |
|----------|----------|
| 기기-서버 통신 보호 방식? | MQTTS (TLS), 포트 8883, Let's Encrypt 인증서 |
| 비밀번호 저장 방식? | Bcrypt 단방향 해시 (salt rounds: 10) |
| 민감 데이터(의료정보) 보호? | AES-256-CBC 암호화, Scrypt 키 파생 |
| 세션 관리 방식? | JWT, 3일 만료, 좀비 세션 감지 |
| 접근 권한 체계? | MASTER > ADMIN > DEVICE_USER 3단계 역할 기반 |
| 감사 추적(Audit Trail)? | 로그인/로그아웃/비밀번호변경/기기관리 이벤트 기록 |
| 오픈소스 취약점 관리? | npm audit 정기 실행, 2026-04-01 기준 0개 (프론트) |
| 데이터 전송 암호화? | HTTPS, WSS, MQTTS 전 구간 TLS 적용 |
| SQL 인젝션 방지? | 전체 DB 쿼리 파라미터화 |

---

## 5. 소프트웨어 구성 (SBOM 요약)

### 5.1 주요 의존성

| 패키지 | 버전 | 용도 |
|--------|------|------|
| next | 16.2.2 | 웹 프레임워크 |
| react | 19.x | UI 라이브러리 |
| next-auth | 4.24.x | 인증 |
| bcrypt / bcryptjs | 6.0.0 / 3.0.2 | 비밀번호 해싱 |
| pg (node-postgres) | - | PostgreSQL 클라이언트 |
| socket.io-client | - | 실시간 통신 |
| @aws-sdk/client-timestream-query | - | AWS Timestream 조회 |
| axios | 1.13.4 | HTTP 클라이언트 |
| firebase-admin | 11.x+ | FCM 푸시 알림 |
| zod | 4.1.x | 입력값 검증 (도입 예정) |

### 5.2 SBOM 전체 목록 생성 방법

```bash
# 프론트엔드
cd ~/wheelchair2-front && npm ls --all --json > sbom-front.json

# 워커
cd ~/worker && npm ls --all --json > sbom-worker.json

# 모바일 앱
cd ~/WheelchairApp && npm ls --all --json > sbom-app.json
```

---

## 6. 결론

본 시스템은 의료기기 사이버보안 인증(IEC TR 60601-4-5) 대비를 위해 다음과 같은 보안 조치를 자체적으로 완료하였습니다:

- **통신 전 구간 TLS 암호화** (MQTTS, WSS, HTTPS)
- **인증/인가 체계** (Bcrypt, JWT, 역할 기반 접근 제어)
- **민감 데이터 암호화** (AES-256-CBC)
- **SQL 인젝션 방지** (파라미터화 쿼리)
- **보안 헤더 적용** (HSTS, X-Frame-Options 등)
- **감사 로그** (로그인, 기기 관리 이벤트 추적)
- **의존성 취약점 패치** (npm audit fix 완료)
- **부하 테스트** (1,000명 동시 접속, 에러율 0%)

잔여 보완 항목(Rate Limiting 적용, 입력값 검증 강화)은 보안 업체 진단 전까지 순차적으로 대응할 예정입니다.
