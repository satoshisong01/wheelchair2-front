# 서버 worker: 2분 유지·욕창 예방 카운트 로직

> **📌 질문/답변 시 인지용**  
> **`worker.ts`는 이 프론트엔드 repo(wheelchair2-front)에 없습니다.**  
> AWS 등 별도 서버에서 실행되는 Node 서버 코드입니다.  
> 사용자가 worker.ts 코드를 붙여 넣거나 worker 관련 질문을 할 때는 **서버 쪽 파일**로 간주하고 답변하세요.

---

프론트엔드는 **2분 유지 로직과 DB 카운트 반영을 하지 않습니다.**  
앱이 꺼져 있어도 동작하도록 **AWS 서버의 worker.ts에서만** 처리합니다.  
(MQTT → worker → RDS/Timestream + Socket.IO로 프론트와 연결되는 구조 기준)

---

## 프론트엔드 변경 요약

- **`fetch('/api/posture-success')` 제거** — 프론트는 더 이상 이 API를 호출하지 않음.
- **타이머는 시각 전용** — 35° 이상일 때 1초마다 0→120까지 증가만 하고, 120초에 도달해도 API 호출 없음.
- **성공 상태·카운트** — 서버가 `wheelchair_status_update`로 `ulcer_count`를 보내면, 그때 화면에 “성공”·“오늘 N회” 반영.

---

## worker.ts에서 할 일 (현재 구조 기준)

- **데이터 소스**: `CW/lt` 메시지에서 `angleSeat`(시트 각도)를 이미 파싱하고 있음 → 여기서 2분 유지 판단.
- **판단**: `angle_seat >= 35`가 **연속 120초** 유지되면 2분 달성 → DB 반영 후 소켓으로 `ulcer_count` 전달.
- **한 번 달성 후**: 같은 35° 유지를 이어가면 **또 2분** 지나면 한 번 더 카운트 (반복 가능).

---

### 1. 유틸/상태 추가 (파일 상단 근처)

```ts
// 2분 욕창 예방: 기기별로 "35° 이상 유지 시작 시각" 저장
const postureHoldStartMap = new Map<number | string, number>();

// 2분 달성 시 posture_daily + wheelchair_status.ulcer_count 반영 (프론트 posture-success API와 동일 로직)
async function applyPostureSuccess(wheelchairId: number | string): Promise<number> {
  const client = await pgPool.connect();
  try {
    const upsert = await client.query(
      `INSERT INTO posture_daily (wheelchair_id, date, count)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (wheelchair_id, date) DO UPDATE SET count = posture_daily.count + 1
       RETURNING count`,
      [wheelchairId]
    );
    const newCount = Number(upsert.rows[0]?.count ?? 0);
    await client.query(
      `UPDATE wheelchair_status SET ulcer_count = $2 WHERE wheelchair_id = $1`,
      [wheelchairId, newCount]
    );
    return newCount;
  } finally {
    client.release();
  }
}
```

- `posture_daily` 테이블이 없다면 한 번 생성:  
  `CREATE TABLE IF NOT EXISTS posture_daily (wheelchair_id ..., date date NOT NULL, count integer NOT NULL DEFAULT 0, PRIMARY KEY (wheelchair_id, date));`  
  (타입은 기존 `wheelchairs.id`에 맞추면 됨.)

---

### 2. CW/lt 처리 블록 안에서 할 일

현재 worker에서는 **먼저** `updateParams`를 채우고 **그 다음** `await upsertWheelchairStatus(...)`를 호출한 뒤, **마지막에** `newStatusData = { ... }` 를 할당하는 구조라서, 아래 두 군데를 수정하면 됨.

**(1) CW/lt 블록 맨 위** (예: `const angleSeat = getFloatValue(parts[5]);` 다음 근처)  
이번 메시지에서 2분 달성 시 반영할 카운트를 담을 변수를 둠.

```ts
let postureUlcerCount: number | null = null; // 이번 CW/lt에서 2분 달성 시만 값 있음
```

**(2) `updateParams`를 다 채운 뒤, `await upsertWheelchairStatus(...)` 바로 앞**에 2분 로직 삽입.

```ts
// ----- 2분 욕창 예방 (35° 연속 120초 유지 시 카운트 +1) -----
const now = Date.now();
const TWO_MIN_MS = 120 * 1000;

if (angleSeat !== null) {
  if (angleSeat >= 35) {
    let startedAt = postureHoldStartMap.get(wheelchairId);
    if (startedAt == null) {
      postureHoldStartMap.set(wheelchairId, now);
      startedAt = now;
    }
    if (now - startedAt >= TWO_MIN_MS) {
      try {
        const newCount = await applyPostureSuccess(wheelchairId);
        postureUlcerCount = newCount;
        updateParams.ulcer_count = newCount;
        postureHoldStartMap.set(wheelchairId, now); // 다음 2분 주기 시작
      } catch (e) {
        console.error('❌ [Posture] applyPostureSuccess failed:', e);
      }
    }
  } else {
    postureHoldStartMap.delete(wheelchairId);
  }
}
```

**(3) `newStatusData = { ... }` 할당한 직후**에, 소켓으로 보낼 객체에 `ulcer_count` 넣기.

```ts
newStatusData = {
  wheelchairId: wheelchairId,
  angleBack,
  angleSeat,
  // ... 기존 필드 ...
};

if (postureUlcerCount != null) {
  newStatusData.ulcer_count = postureUlcerCount;
  newStatusData.ulcerCount = postureUlcerCount;
}
```

이렇게 하면 2분 달성 시 같은 CW/lt 처리 안에서 DB 업데이트와 소켓 전송 모두에 `ulcer_count`가 포함됨.

---

### 3. 소켓 전송

- 이미 `newStatusData`를 `io.emit('wheelchair_status_update', newStatusData)` 로 보내고 있으므로,  
  위에서 `newStatusData.ulcer_count` / `ulcerCount`만 넣어 주면 프론트는 그대로 `status.ulcer_count` / `status.ulcerCount` 로 받아서 “오늘 N회”·2분 달성 시각 효과를 표시할 수 있음.

---

## 프론트와 겹치지 않도록

- **2분 타이머·카운트 증가·DB 반영** → **worker만** 수행 (MQTT `CW/lt` 수신 시점 기준).
- **프론트** → 타이머는 **시각만** (0~120초 표시), 성공/횟수는 **서버에서 오는 `ulcer_count`** 에만 반응.

이렇게 하면 앱이 꺼져 있어도 worker가 2분 유지를 감지하고 카운트를 올리며,  
앱을 켜면 소켓으로 받은 `ulcer_count`로 화면이 맞춰집니다.

---

## 참고: 알림음(인천 연구소 프로토콜)

- 욕창 예방 **알림음**은 연구소에서 프로토콜 수정 후 연락 주시면 그에 맞춰 구현하면 됨.  
- 2분 달성 **카운트·DB·소켓**은 위 로직만으로 프론트와 연동 가능.
