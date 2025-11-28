// 📍 경로: app/welcome/page.tsx (전체 코드)

'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// 임시 로딩 스피너 (경로 확인 필요)
const LoadingSpinner = () => (
    <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="text-gray-600 mt-3">데이터를 불러오는 중입니다...</p>
        </div>
    </div>
);

export default function WelcomePage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();

  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. 초기값 세팅 및 세션 데이터 사용
  useEffect(() => {
    if (session?.user) {
      // @ts-ignore
      setName(session.user.name || '');
      // @ts-ignore
      setOrganization(session.user.organization || '');
      // @ts-ignore
      setPhoneNumber(session.user.phoneNumber || '');
    }
  }, [session]);


  // 2. [리다이렉트 체크] 로딩 중이거나 GUEST가 아니면 폼을 보여줄 필요 없음
  if (status === 'loading' || !session) return <LoadingSpinner />;
  
  // @ts-ignore
  const userRole = session.user.role;
  // @ts-ignore
  const userOrg = session.user.organization; 
  
  // 3. GUEST가 아닐 때 (PENDING/USER) -> 스피너 표시 후 미들웨어에 리다이렉트 위임
  if (userRole !== 'GUEST') return <LoadingSpinner />;

  // 4. [정보 제출 후 캐시 남아있을 때] -> 즉시 이동 유도 (무한 루프 방지)
  if (userOrg) {
      console.log("✅ [GUEST-BYPASS] 프로필 정보가 이미 있어, /pending으로 강제 이동");
      window.location.assign('/pending'); 
      return <LoadingSpinner />;
  }


  // 5. 제출 핸들러 (GUEST -> PENDING으로 상태 변경)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/profile-submit', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, organization, phoneNumber }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || '프로필 업데이트에 실패했습니다.');
      } 
      
      // ⭐️ 1. 서버 DB 업데이트 성공 후, 세션 갱신 요청
      await update(); 
      
      // ⭐️ 2. [FINAL FIX] 브라우저를 완전히 재로드하여 쿠키 갱신을 강제합니다. (가장 확실한 방법)
      window.location.assign('/pending'); 

    } catch (err: any) {
      setError(err.message || "저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- UI 폼 (Tailwind 기반) ---
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h1 className="text-2xl font-bold text-center mb-2 text-gray-800">환영합니다! 👋</h1>
        <p className="text-center text-gray-600 mb-6">
          관리자 승인을 위해<br />추가 정보를 입력해 주세요.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
            <input 
              type="text" 
              value={session?.user?.email || '카카오 계정'} 
              disabled 
              className="w-full border bg-gray-100 px-3 py-2 rounded text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              required
              className="w-full border px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="홍길동"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">소속</label>
            <input 
              type="text" 
              value={organization} 
              onChange={(e) => setOrganization(e.target.value)} 
              required
              className="w-full border px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="예: 대한재활센터"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
            <input 
              type="tel" 
              value={phoneNumber} 
              onChange={(e) => setPhoneNumber(e.target.value)} 
              required
              className="w-full border px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="010-1234-5678"
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-gray-400"
          >
            {isLoading ? '저장 중...' : '제출하고 승인 요청'}
          </button>
        </form>
      </div>
    </div>
  );
}