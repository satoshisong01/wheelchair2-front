'use client';

import { useSyncExternalStore } from 'react';
import { preconnect, preload } from 'react-dom';

// SDK 주소는 이 파일에서만 정의 — 사용처마다 주소가 한 글자라도 다르면 SDK를 따로 받음
export const KAKAO_MAP_SDK_URL = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY}&autoload=false`;
export const KAKAO_MAP_SDK_SERVICES_URL = `${KAKAO_MAP_SDK_URL}&libraries=services`;

// 지도 자리표시 이미지 — 같은 경로가 CSS(MapView.module.css .mapContainer, 위치 페이지 지도 영역 클래스)에도 있음
const MAP_PLACEHOLDER_URL = '/images/map-placeholder.webp';

const subscribeNothing = () => () => {};

// 서버·하이드레이션 렌더에선 false, 이후 클라이언트 렌더에선 true
// SDK <Script>는 이 값이 true일 때만 렌더할 것 — App Router의 next/script(afterInteractive)는 렌더 중에 SDK를
// preload하므로, SSR되면 High 우선순위 SDK preload가 <head>에 실려 아래와 같은 이유로 FCP가 늦어짐
export function useIsClient() {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}

// SSR되는 곳(레이아웃·페이지)에서 렌더해야 힌트가 HTML <head>에 실림
// - 지도 자리표시 이미지 preload: CSS를 받은 뒤가 아니라 CSS와 병렬로 받아, 지도 영역이 첫 페인트에 함께 그려지게 함 (LCP)
// - 카카오 SDK·타일 서버는 preconnect만: SDK까지 preload하면 첫 페인트 전에 끝난 cross-origin 스크립트를
//   Lighthouse(Lantern)가 렌더 차단으로 계산해 FCP가 늦어짐 (실측 0.92s → 1.55s)
export default function KakaoMapSdkPreload() {
  preconnect('https://dapi.kakao.com');
  preconnect('https://t1.daumcdn.net');
  preconnect('https://mts.daumcdn.net');
  preload(MAP_PLACEHOLDER_URL, { as: 'image', fetchPriority: 'high' });
  return null;
}
