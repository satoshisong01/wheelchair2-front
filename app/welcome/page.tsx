// 📍 경로: app/welcome/page.tsx
// 📝 설명: 정보 제출 후 세션 갱신 대기 및 강제 이동 로직 강화

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// 로딩 스피너 컴포넌트
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

  // 1. 초기값 세팅
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

  // 2. [핵심] 역할 변경 감지 및 리다이렉트
  // 세션이 업데이트되어 GUEST가 아니게 되면 즉시 페이지 이동
  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      // @ts-ignore
      const role = session.user.role;
      // @ts-ignore
      const org = session.user.organization;

      // 이미 정보가 있거나 GUEST가 아니면 이동
      if (role !== 'GUEST' || org) {
        console.log(
          `✅ [Redirect] Role: ${role}, Org: ${org} -> /pending 이동`
        );
        window.location.href = '/pending'; // 확실한 이동을 위해 href 사용
      }
    }
  }, [session, status]);

  // 3. 로딩 중이거나 세션 없을 때
  if (status === 'loading' || !session) return <LoadingSpinner />;

  // @ts-ignore
  const userRole = session.user.role;

  // 4. 이미 처리된 유저가 폼을 못 보게 막음 (깜빡임 방지)
  if (userRole !== 'GUEST') return <LoadingSpinner />;

  // 5. 제출 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // API 호출
      const response = await fetch('/api/auth/profile-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, organization, phoneNumber }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || '프로필 업데이트에 실패했습니다.');
      }

      // ⭐️ 세션 강제 갱신 (서버에서 바뀐 DB 정보를 가져옴)
      await update();

      // ⭐️ 잠시 대기 후 강제 이동 (useEffect가 감지하겠지만 이중 안전장치)
      setTimeout(() => {
        window.location.href = '/pending';
      }, 500);
    } catch (err: any) {
      setError(
        err.message || '저장에 실패했습니다. 잠시 후 다시 시도해주세요.'
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h1 className="text-2xl font-bold text-center mb-2 text-gray-800">
          환영합니다! 👋
        </h1>
        <p className="text-center text-gray-600 mb-6">
          관리자 승인을 위해
          <br />
          추가 정보를 입력해 주세요.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이메일
            </label>
            <input
              type="text"
              value={session?.user?.email || '카카오 계정'}
              disabled
              className="w-full border bg-gray-100 px-3 py-2 rounded text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이름
            </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              소속
            </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              전화번호
            </label>
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
