// 📍 경로: app/page.tsx — 첫 화면(기기 로그인). 화면 동작은 LandingClient에 그대로 있음
import LandingClient from './LandingClient';
import { getLoginBanner } from '@/lib/login-banner';

// 🔒 [uc_auth_11] MASTER가 설정한 사용 알림 배너를 서버에서 읽어 첫 HTML에 싣는다.
//   화면 로드 후 클라이언트에서 받아 다시 그리면 그 글이 늦게 그려진 LCP가 되므로(KTC 1번 페이지),
//   ISR로 정적 HTML을 유지하고 60초마다 백그라운드에서 다시 생성한다. DB 실패·빌드 시 DB 없음이면 기본 문구.
export const revalidate = 60;

export default async function LandingPage() {
  const bannerText = await getLoginBanner();
  return <LandingClient bannerText={bannerText} />;
}
