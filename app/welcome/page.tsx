// 📍 경로: app/welcome/page.tsx
// 📝 설명: Role 기반으로 거절(REJECTED) 상태 감지 및 처리

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

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

  // 2. [핵심 수정] Role 기반 리다이렉트 방어 로직
  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      // @ts-ignore
      const role = session.user.role; // ⭐️ status 대신 role 사용
      // @ts-ignore
      const org = session.user.organization;

      // 🛡️ [예외 처리] Role이 'REJECTED'라면?
      // -> 정보(org)가 있어도 쫓아내지 말고 수정할 수 있게 멈춤!
      if (role === 'REJECTED') {
        return;
      }

      // 기존 로직: GUEST가 아니거나(이미 승인됨), 정보가 있으면 대시보드/대기화면으로 이동
      if (role !== 'GUEST' || org) {
        console.log(
          `✅ [Redirect] Role: ${role}, Org: ${org} -> /pending 이동`
        );
        window.location.href = '/pending';
      }
    }
  }, [session, status]);

  if (status === 'loading' || !session) return <LoadingSpinner />;

  // @ts-ignore
  const userRole = session.user.role;
  // @ts-ignore
  const rejectReason = session.user.rejectReason; // (DB user테이블에 reject_reason 컬럼이 있어야 함)

  // 4. 화면 렌더링 조건 (GUEST거나 REJECTED인 경우만 폼 노출)
  if (userRole !== 'GUEST' && userRole !== 'REJECTED')
    return <LoadingSpinner />;

  // 5. 제출 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // ⚠️ [API 체크] 이 API는 DB에서 사용자의 role을 다시 'GUEST'로 바꿔줘야 합니다!
      const response = await fetch('/api/auth/profile-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, organization, phoneNumber }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || '프로필 업데이트에 실패했습니다.');
      }

      await update(); // 세션 갱신 (Role: REJECTED -> GUEST)

      alert('제출이 완료되었습니다. 승인 대기 화면으로 이동합니다.');
      window.location.replace('/pending');
    } catch (err: any) {
      setError(err.message || '저장에 실패했습니다.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        {/* ⭐️ Role에 따라 제목 변경 */}
        <h1 className="text-2xl font-bold text-center mb-2 text-gray-800">
          {userRole === 'REJECTED' ? '⚠️ 정보 수정 요청' : '환영합니다! 👋'}
        </h1>

        {/* ⭐️ 거절 사유 표시 */}
        {userRole === 'REJECTED' ? (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6 text-sm text-red-700">
            <p className="font-bold mb-1">
              관리자에 의해 가입이 거절되었습니다.
            </p>
            {rejectReason && (
              <p className="mb-2">
                사유: <span className="font-semibold">{rejectReason}</span>
              </p>
            )}
            <p className="text-xs text-red-500">
              정보를 올바르게 수정한 뒤 다시 제출해주세요.
            </p>
          </div>
        ) : (
          <p className="text-center text-gray-600 mb-6">
            관리자 승인을 위해
            <br />
            추가 정보를 입력해 주세요.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ... (입력 필드들은 기존과 동일) ... */}

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
              className="w-full border px-3 py-2 rounded outline-none"
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
              className="w-full border px-3 py-2 rounded outline-none"
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
              className="w-full border px-3 py-2 rounded outline-none"
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-gray-400"
          >
            {isLoading
              ? '저장 중...'
              : userRole === 'REJECTED'
              ? '수정하고 재승인 요청'
              : '제출하고 승인 요청'}
          </button>
        </form>
      </div>
    </div>
  );
}
