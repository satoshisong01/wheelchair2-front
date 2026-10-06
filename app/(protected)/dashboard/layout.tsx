import KakaoMapSdkPreload from '@/components/maps/KakaoMapSdkPreload';

// 페이지는 세션 확인 전엔 지도를 SSR하지 않으므로, 지도 SDK 힌트는 이 레이아웃에서 HTML에 실음
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <KakaoMapSdkPreload />
      {children}
    </>
  );
}
