import IdleLogout from '@/components/common/IdleLogout'; // 🔒 [UC-03] 유휴 세션 자동 로그아웃

// (protected) 레이아웃 밖 화면이라 유휴 로그아웃을 따로 붙임 — 사용 여부·시간은 보안 프로필(lib/security-profile.ts)
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <IdleLogout />
      {children}
    </>
  );
}
