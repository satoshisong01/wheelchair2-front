'use client';

import { preconnect, preload } from 'react-dom';

// <Script src>와 preload 주소가 한 글자라도 다르면 SDK를 두 번 받으므로 이 파일에서만 정의
export const KAKAO_MAP_SDK_URL = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY}&autoload=false`;
export const KAKAO_MAP_SDK_SERVICES_URL = `${KAKAO_MAP_SDK_URL}&libraries=services`;

interface KakaoMapSdkPreloadProps {
  services?: boolean;
}

// SSR되는 곳에서 렌더해야 힌트가 HTML에 실려 하이드레이션 전에 SDK·타일 서버 연결이 시작됨
export default function KakaoMapSdkPreload({ services = false }: KakaoMapSdkPreloadProps) {
  preconnect('https://dapi.kakao.com');
  preconnect('https://t1.daumcdn.net');
  preconnect('https://mts.daumcdn.net');
  // crossOrigin 미지정 — next/script가 주입하는 <script>와 요청 모드가 같아야 preload를 재사용함
  preload(services ? KAKAO_MAP_SDK_SERVICES_URL : KAKAO_MAP_SDK_URL, { as: 'script' });
  return null;
}
