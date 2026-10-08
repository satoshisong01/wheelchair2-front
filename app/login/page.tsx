// app/login/page.tsx — 관리자 로그인. 화면 동작은 LoginClient에 있음(앱에 SESSION_EXPIRED는 보내지 않음)
import LoginClient from './LoginClient';
import { getLoginBanner } from '@/lib/login-banner';

// 🔒 [uc_auth_11] MASTER가 설정한 사용 알림 배너를 서버에서 읽어 첫 HTML에 싣는다(ISR 60초, 실패 시 기본 문구)
export const revalidate = 60;

export default async function LoginPage() {
  const bannerText = await getLoginBanner();
  return <LoginClient bannerText={bannerText} />;
}
