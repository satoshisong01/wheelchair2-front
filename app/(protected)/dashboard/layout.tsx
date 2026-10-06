import KakaoMapSdkPreload from '@/components/maps/KakaoMapSdkPreload';

// 지도 자리표시 이미지 preload·카카오 서버 preconnect 힌트를 HTML <head>에 실음 (첫 페인트에 지도 영역이 그려지도록)
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <KakaoMapSdkPreload />
      {children}
    </>
  );
}
