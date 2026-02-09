# 📘 휠체어 IoT 모니터링 시스템 - 기술 백서 및 개발 가이드

## 1. 아키텍처 개요 (Architecture)

이 프로젝트는 **"웹뷰(WebView) 기반 하이브리드 앱"** 방식을 채택하여 개발 생산성과 유지보수 효율성을 극대화했습니다.

### 🏗️ 기술 스택 (Tech Stack)

- **Frontend (Web):** Next.js 기반 반응형 웹사이트. (Vercel 배포)
- **Mobile (App):** React Native (Web Wrapper). 웹사이트를 감싸고 네이티브 기능(푸시 알림, 진동, 소리)을 담당.
- **Backend (Server):** Node.js / TypeScript (`worker.ts`). MQTT 데이터 수신, DB 처리, 알림 발송의 핵심 두뇌.
- **Infra & DB:** AWS EC2 (Server), PostgreSQL (DB), AWS Timestream (시계열 데이터), Firebase (FCM).
- **Protocol:** MQTT (하드웨어 통신), HTTP/Socket.io (앱 통신).

---

## 2. React Native (App) 구현 상세

앱은 웹사이트를 보여주는 '화면' 역할과 서버의 신호를 받는 '수신기' 역할을 동시에 수행합니다.

### A. 웹뷰(WebView) 브릿지 통신

앱 내부에 웹사이트를 띄우기 위해 `react-native-webview`를 사용합니다.

- **로그인 연동:** 웹에서 로그인이 성공하면 `window.ReactNativeWebView.postMessage`를 통해 앱으로 **User ID**를 전달합니다.
- **구독(Subscribe):** 앱은 전달받은 ID를 이용해 FCM Topic을 구독합니다. (`messaging().subscribeToTopic(userId)`)

### B. 파일별 역할 분담 (생명주기 관리)

앱이 켜져 있을 때와 꺼져 있을 때를 구분하여 로직을 분리했습니다.

| 파일명         | 실행 시점                          | 주요 역할                                                                                                                                                                          |
| :------------- | :--------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`App.jsx`**  | **Foreground** (앱 사용 중)        | - 화면(WebView) 렌더링<br>- **Socket.io 연결:** 앱 버전 체크 및 강제 업데이트 팝업<br>- **로그인/로그아웃 감지:** 알림 구독 설정/해제<br>- 앱 실행 중 알림 수신 시 `Alert` 창 표시 |
| **`index.js`** | **Background / Quit** (앱 종료 시) | - **Headless JS:** 화면 없이 백그라운드에서 코드 실행<br>- **Notifee 라이브러리:** 시스템 트레이에 알림 표시, 소리 재생, 진동 울리기 담당                                          |

---

## 3. 푸시 알림 시스템 (FCM Topic 방식)

기존의 복잡한 **Token 관리 방식**을 버리고, 확장성이 뛰어난 **Topic(채널) 방식**을 도입했습니다.

### 📡 Topic 방식의 장점

1.  **DB 관리 불필요:** 서버가 사용자의 FCM Token을 일일이 저장하고 갱신할 필요가 없습니다.
2.  **자동화:** 사용자는 로그인만 하면 자동으로 자신의 ID 채널(Topic)을 구독하게 됩니다.
3.  **다중 기기 지원:** 사용자가 핸드폰, 태블릿 등 여러 기기에서 로그인해도 모든 기기에서 동시에 알림을 받을 수 있습니다.

### ⚙️ 필수 설정 파일

- **Android App:** `google-services.json` (안드로이드 앱 식별용)
- **Node.js Server:** `service-account.json` (Firebase Admin SDK 인증용)

---

## 4. 서버 로직 (`worker.ts`) 상세

서버는 하드웨어(MQTT)와 사용자(App) 사이를 연결하는 **중계 및 제어 센터**입니다.

### A. 데이터 처리 흐름 (Pipeline)

1.  **수신 (MQTT):** 하드웨어로부터 시리얼 번호와 센서 데이터(`E_FALL`, `CW/lt` 등)를 수신합니다.
2.  **매핑 (DB 조회):** `device_serial`로 `wheelchair_id`를 찾고, 다시 연결된 `user_id`를 조회합니다.
3.  **발송 (FCM):** 조회된 `user_id`를 Topic으로 하여 푸시 알림을 발송합니다.

### B. 스마트 로직 (Smart Logic)

1.  **욕창 예방 알고리즘:**
    - `angle_seat`(시트 각도)가 **35도 이상**인 상태를 감지합니다.
    - 서버 메모리에 상태를 저장하며 시간을 잽니다.
    - **2분(120초)** 유지 시 `posture_daily` 테이블 카운트를 증가시키고, "성공" 알림을 보냅니다.
2.  **중복 알림 방지:**
    - FCM 발송 시 `notification` 필드를 제거하고 `data` 필드만 사용합니다.
    - 이를 통해 시스템 자동 알림(중복)을 막고, 앱이 알림 표시 방식을 전적으로 제어합니다.
3.  **자동화 스케줄러:**
    - **Node-cron:** 매일 자정(00:00)에 주행 거리 및 시간을 초기화합니다.
    - **날씨 API:** 1시간마다 휠체어 위치 기반 날씨 정보를 갱신합니다.

---

## 5. 배포 및 빌드 가이드 (Deployment)

### 📱 Android 앱 빌드

React Native 코드를 APK 파일로 변환하는 과정입니다.

```bash
cd android
./gradlew assembleRelease
# 출력 경로: android/app/build/outputs/apk/release/app-release.apk
```
