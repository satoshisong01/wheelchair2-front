'use client';

import { useEffect, useState } from 'react';
import { preconnect, preload } from 'react-dom';

// SDK 주소는 이 파일에서만 정의 — 사용처마다 주소가 한 글자라도 다르면 SDK를 따로 받음
export const KAKAO_MAP_SDK_URL = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY}&autoload=false`;
export const KAKAO_MAP_SDK_SERVICES_URL = `${KAKAO_MAP_SDK_URL}&libraries=services`;

// 지도 자리표시 이미지 — 같은 경로가 CSS(MapView.module.css .mapContainer, 위치 페이지 지도 영역 클래스)에도 있음
const MAP_PLACEHOLDER_URL = '/images/map-placeholder.webp';

// 자리표시 이미지가 그려졌는지 확인하지 못해도 이 시간이 지나면 SDK를 불러옴 — 숨은 탭(rAF가 돌지 않음)이나
//   decode·rAF 이상으로 지도가 영영 뜨지 않는 일이 없게 넉넉히 잡음 (정상이면 decode + 2프레임, 수십 ms 안에 끝남)
const MAP_PLACEHOLDER_PAINT_FALLBACK_MS = 3000;

// 지도 자리표시 이미지가 decode되어 한 프레임 이상 그려진 뒤 true — 서버·하이드레이션 렌더에선 항상 false
// SDK <Script>는 이 값이 true일 때만 렌더할 것:
// - App Router의 next/script(afterInteractive)는 렌더 중에 SDK를 preload하므로, SSR되면 High 우선순위 SDK preload가
//   <head>에 실려 FCP가 늦어짐 (아래 KakaoMapSdkPreload 주석)
// - 카카오 SDK는 지도를 만들 때 같은 컨테이너에 인라인 배경을 써서 자리표시 이미지를 덮음. 첫 페인트 전에 지도가 만들어지면
//   자리표시 이미지가 한 번도 그려지지 않아 카카오 타일이 LCP가 되고, Lighthouse 시뮬레이션은 그 전에 끝난 SDK 요청까지
//   LCP에 넣음 (첫 페인트가 늦어진 실측: 2.26s → 3.6~6.7s)
export function useMapPlaceholderPainted(): boolean {
  const [isPainted, setIsPainted] = useState(false);

  useEffect(() => {
    let done = false; // 이미 true로 바꿨거나 언마운트됨 — 늦게 온 콜백은 무시
    let rafId: number | null = null;
    let fallbackTimerId: number | null = null;

    // 대기 중인 rAF·대비 타이머 정리 (완료 시·언마운트 시 공통)
    const stop = () => {
      done = true;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (fallbackTimerId !== null) window.clearTimeout(fallbackTimerId);
    };
    const markPainted = () => {
      if (done) return;
      stop();
      setIsPainted(true);
    };
    // rAF 2번: 첫 콜백은 다음 프레임을 그리기 직전, 두 번째 콜백은 그 프레임이 만들어진 뒤에 돌아서
    //   decode된 자리표시 이미지가 담긴 프레임이 최소 1장 나온 뒤에 true가 됨
    const waitForPaintedFrame = () => {
      if (done) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = window.requestAnimationFrame(markPainted);
      });
    };

    fallbackTimerId = window.setTimeout(markPainted, MAP_PLACEHOLDER_PAINT_FALLBACK_MS);
    // preload한 이미지와 같은 주소라 다시 받지 않음. decode 실패해도 같은 처리 — 이미지가 깨져도 지도는 떠야 함
    const img = new Image();
    img.src = MAP_PLACEHOLDER_URL;
    img.decode().then(waitForPaintedFrame, waitForPaintedFrame);

    return stop;
  }, []);

  return isPainted;
}

// SSR되는 곳(레이아웃·페이지)에서 렌더해야 힌트가 HTML <head>에 실림
// - 지도 자리표시 이미지 preload: CSS를 받은 뒤가 아니라 CSS와 병렬로 받아, 지도 영역이 첫 페인트에 함께 그려지게 함 (LCP)
// - 카카오 SDK·타일 서버는 preconnect만: SDK까지 preload하면 첫 페인트 전에 끝난 cross-origin 스크립트를
//   Lighthouse(Lantern)가 렌더 차단으로 계산해 FCP가 늦어짐 (실측 0.92s → 1.55s)
// - 카카오 CDN이 *.daumcdn.net → *.kakaocdn.net으로 바뀜 (본 스크립트 t1, 타일 mts — next.config.js CSP 주석 참고)
export default function KakaoMapSdkPreload() {
  preconnect('https://dapi.kakao.com');
  preconnect('https://t1.kakaocdn.net');
  preconnect('https://mts.kakaocdn.net');
  preload(MAP_PLACEHOLDER_URL, { as: 'image', fetchPriority: 'high' });
  return null;
}
