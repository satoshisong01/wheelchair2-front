# 프로젝트 설정 상태

## ✅ 완료된 작업

### 1. Next.js 프로젝트 생성

- TypeScript + Tailwind CSS
- App Router 구조
- 개발 서버 정상 작동 중 (`localhost:3000`)

### 2. 필수 패키지 설치 완료

```bash
✓ typeorm - 데이터베이스 ORM
✓ pg - PostgreSQL 드라이버
✓ next-auth - 인증
✓ socket.io - 실시간 통신
✓ @aws-sdk/client-timestream-* - Timestream 클라이언트
✓ mqtt - MQTT 클라이언트
✓ bcryptjs, jsonwebtoken, helmet - 보안
```

### 3. TypeORM 엔티티 생성 완료

```
✓ entities/User.ts
✓ entities/Role.ts
✓ entities/MedicalInfo.ts (암호화 대상)
✓ entities/Wheelchair.ts
✓ entities/UserWheelchair.ts (N:M 매핑)
✓ entities/Status.ts
✓ entities/WheelchairStatus.ts (실시간 캐시)
✓ entities/Alarm.ts
```

### 4. 기본 라이브러리 설정

```
✓ lib/db.ts - TypeORM 데이터소스
✓ lib/mqtt.ts - MQTT 클라이언트
✓ lib/aws.ts - AWS SDK
✓ lib/crypto.ts - AES-256 암호화
✓ types/wheelchair.ts - TypeScript 타입 정의
```

### 5. 데이터베이스 초기화 스크립트

```
✓ scripts/init-db.sql - 기본 데이터 삽입
```

## ⏳ 다음 단계

### 우선순위 1: AWS 인프라 설정

- [ ] AWS RDS PostgreSQL 인스턴스 생성
- [ ] AWS EC2 인스턴스 생성 (t3.micro)
- [ ] Mosquitto MQTTS 브로커 설정
- [ ] 보안 그룹 구성

### 우선순위 2: 데이터베이스 설정

- [ ] `.env.local` 파일 생성
- [ ] RDS 연결 정보 설정
- [ ] 데이터베이스 스키마 생성
- [ ] 초기 데이터 삽입

### 우선순위 3: 인증 시스템

- [ ] Next-Auth 설정
- [ ] 카카오 OAuth 구현
- [ ] 로그인/로그아웃 페이지

### 우선순위 4: API Routes 구현

- [ ] 휠체어 데이터 API
- [ ] 통계 API
- [ ] 알람 API

## 📝 참고사항

### 환경 변수 설정 필요

프로젝트 루트에 `.env.local` 파일을 생성하고 다음 변수를 설정하세요:

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
MQTT_USERNAME=wheelchair_client
MQTT_PASSWORD=your-secure-password

# AWS
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key
```

### 개발 서버 실행

```bash
npm run dev
# http://localhost:3000
```

## 📚 개발 계획 (28주)

### P1: 인프라/백엔드 (1-10주차) ✅ 진행중

- ✅ 1주차: Next.js 프로젝트 생성
- 🔄 2주차: TypeORM 엔티티 생성
- ⏳ 3-10주차: AWS 인프라, MQTT, DB 연동

### P2: 앱 개발 (11-23주차)

- 인증 시스템
- API Routes
- UI/UX 개발
- 실시간 연동

### P3: 테스트/배포 (24-28주차)

- 보안 적용
- 부하 테스트
- 배포 및 안정화




