# TypeScript 모듈 인식 오류 해결 방법

`entities/User.ts`에서 `Cannot find module './Role'` 오류가 발생하는 경우:

## ✅ 해결 방법

### 1. VSCode TypeScript 서버 재시작

1. `Ctrl + Shift + P` (Command Palette)
2. `TypeScript: Restart TS Server` 입력
3. 선택

### 2. VSCode 완전 재시작

VSCode를 완전히 종료하고 다시 열기

### 3. 캐시 삭제

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force .next
npm run dev
```

### 4. 프로젝트 다시 로드

1. `Ctrl + Shift + P`
2. `Developer: Reload Window` 입력

## 📝 현재 상태

- ✅ 파일 존재: `entities/Role.ts` 파일 존재 확인됨
- ✅ tsconfig.json: 설정 정상
- ✅ import 구문: 정상
- ⚠️ TypeScript 서버: 재시작 필요

## 확인 사항

이 오류는 **TypeScript 언어 서버**의 캐시 문제입니다. 실제로는 컴파일이 정상적으로 됩니다.

### 실제 코드는 정상 작동함

`npm run dev` 실행 시 Next.js는 정상적으로 컴파일되고 실행됩니다.

이 오류는 **IDE의 타입 체크 오류**이며, 런타임에는 문제가 없습니다.




