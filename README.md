# 휠체어 관제 및 데이터 분석 플랫폼

전동 휠체어의 실시간 위치, 상태 모니터링 및 데이터 분석을 위한 플랫폼입니다.

## 📋 프로젝트 개요

- **목표 규모**: 사용자 1000명 / 휠체어 디바이스 1000대
- **개발 규모**: 1인 개발 (초급)
- **총 예상 기간**: 약 28주 (7개월)

## 🏗️ 기술 스택

### Frontend

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Chart.js / Recharts
- **Maps**: Kakao Map API / Naver Map API

### Backend

- **API**: Next.js API Routes (Vercel)
- **Realtime Server**: Node.js (AWS EC2)
- **MQTT Broker**: Mosquitto (AWS EC2)
- **Authentication**: Next-Auth.js (Kakao OAuth)

### Database

- **RDBMS**: AWS RDS (PostgreSQL) + TypeORM
- **TSDB**: Amazon Timestream

### Security

- **MQTT**: MQTTS (TLS/SSL)
- **Database**: AES-256 암호화 (MedicalInfo)
- **API**: Helmet, CSRF, Rate Limiting

## 🎯 주요 기능

1. **대시보드**

   - 지도에 휠체어 위치 표시
   - 실시간 상태 모니터링
   - 알람/이벤트 관리
   - 충전량 모니터링

2. **휠체어 정보**

   - 위치, 등각도, 이동거리
   - 배터리 상태
   - 운행 정보 (전압, 전류, 속도 등)
   - 충전 상태

3. **통계 그래프**

   - 일간/주간/월간/연간 통계
   - 기기별 필터링
   - 배터리 사용 데이터

4. **회원 관리**
   - 카카오 로그인
   - 권한 관리
   - 개인정보 암호화

## 🚀 시작하기

### 환경 요구사항

- Node.js 20+
- npm 또는 yarn
- PostgreSQL (로컬 개발용)
- AWS 계정 (배포용)

### 설치

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 빌드
npm run build

# 프로덕션 시작
npm start
```

### 환경 변수 설정

`.env.local` 파일을 생성하고 다음 환경 변수를 설정하세요:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/wheelchair_db

# Next-Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here
KAKAO_CLIENT_ID=your-kakao-client-id
KAKAO_CLIENT_SECRET=your-kakao-client-secret

# MQTT (EC2)
MQTT_BROKER_URL=mqtts://your-ec2-ip:8883
MQTT_USERNAME=your-mqtt-username
MQTT_PASSWORD=your-mqtt-password

# AWS
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key

# Timestream
TIMESTREAM_DATABASE_NAME=wheelchair_timestream
TIMESTREAM_TABLE_NAME=wheelchair_data
```

## 📁 프로젝트 구조

```
wheelchair2-front/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── mqtt/          # MQTT WebSocket
│   │   ├── wheelchair/    # 휠체어 API
│   │   └── auth/          # 인증 API
│   ├── dashboard/         # 대시보드 페이지
│   ├── wheelchair-info/   # 휠체어 정보 페이지
│   ├── statistics/        # 통계 페이지
│   └── user-management/   # 회원 관리 페이지
├── components/            # React 컴포넌트
│   ├── maps/             # 지도 컴포넌트
│   ├── charts/           # 차트 컴포넌트
│   └── common/           # 공통 컴포넌트
├── lib/                   # 유틸리티
│   ├── mqtt.ts           # MQTT 클라이언트
│   ├── db.ts             # TypeORM 설정
│   └── aws.ts            # AWS SDK
├── types/                 # TypeScript 타입 정의
└── public/               # 정적 파일
```

## 📚 개발 계획

- **P1: 인프라/백엔드** (1-10주차) ✅
  - AWS 인프라 구축
  - MQTTS 브로커 설정
  - DB 스키마 및 TypeORM 연동
  - Node.js 워커 개발
- **P2: 앱 개발** (11-23주차)
  - 인증 시스템 (Next-Auth)
  - API 개발
  - UI/UX 개발
  - 실시간 연동
- **P3: 테스트/배포** (24-28주차)
  - 보안 적용
  - 부하 테스트
  - 배포 및 안정화

## 📝 라이선스

Private Project

## 🤝 기여

프로젝트는 R&D 단계입니다.
