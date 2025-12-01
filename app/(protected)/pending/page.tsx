// 📍 경로: app/pending/page.tsx
// 📝 설명: 승인 대기 및 거절 상태 처리, 자동 이동 로직 보강

'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// 로딩 스피너
const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
      <p className="text-gray-600 mt-3">상태 확인 중...</p>
    </div>
  </div>
);

export default function PendingPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  // TS Fix 및 데이터 구조 확보
  const user = session?.user as unknown as
    | {
        role: string;
        name: string;
        organization: string;
        phoneNumber: string;
        rejectionReason?: string;
      }
    | undefined;

  // 1. [로직 개선] 역할 변경 감지 및 자동 이동
  useEffect(() => {
    if (status === 'authenticated' && user) {
      const currentRole = user.role;

      // 이미 승인된 경우 -> 대시보드
      if (['USER', 'ADMIN', 'MASTER'].includes(currentRole)) {
        console.log(`[PENDING-PAGE] 승인됨 (${currentRole}). 대시보드로 이동.`);
        router.replace('/dashboard');
      }
      // 아직 GUEST인 경우 (정보 제출 직후 등) -> 잠시 대기
      else if (currentRole === 'GUEST') {
        // 보통 welcome 페이지에서 세션 갱신 후 오지만, 만약 갱신 안 됐다면 여기서 재시도
        // (무한 루프 방지를 위해 별도 처리 없음, 화면에서 '로딩' 보여줌)
      }
    }
  }, [status, user, router]);

  // 2. [로딩/권한 체크]
  if (status === 'loading' || !user) {
    return <LoadingSpinner />;
  }

  // 3. 재신청 핸들러 (거절된 경우)
  const handleReapply = async () => {
    if (
      !confirm(
        '현재 정보를 초기화하고 프로필 재작성 페이지로 이동하시겠습니까?'
      )
    ) {
      return;
    }

    try {
      // 재신청 API 호출 (서버에서 role을 GUEST로 변경)
      const res = await fetch('/api/auth/re-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        // 세션 강제 갱신 (GUEST로 변경됨을 인지)
        await update();
        alert('재신청을 위해 프로필 작성 페이지로 이동합니다.');
        // 페이지 강제 이동 (Next.js 라우터보다 확실함)
        window.location.href = '/welcome';
      } else {
        const data = await res.json();
        alert(`재신청 실패: ${data.message || '오류가 발생했습니다.'}`);
      }
    } catch (error) {
      console.error('Re-apply error:', error);
      alert('서버 오류가 발생했습니다.');
    }
  };

  // -------------------------------------------------------
  // 4. 거절됨 (REJECTED) 상태 렌더링
  // -------------------------------------------------------
  if (user.role === 'REJECTED') {
    return (
      <div className="p-4 flex justify-center items-start min-h-screen bg-gray-50">
        <div className="w-full max-w-lg mt-10 p-8 rounded-xl shadow-2xl border-2 border-red-300 bg-white">
          <h1 className="text-3xl font-extrabold text-red-600 mb-4">
            🚫 승인 거절됨
          </h1>
          <p className="text-lg text-gray-700 mb-6">
            마스터 관리자가 회원님의 계정 승인을 거절했습니다.
          </p>

          <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-6 text-left">
            <h3 className="text-base font-bold text-red-700 mb-1">
              거절 사유:
            </h3>
            <p className="whitespace-pre-wrap text-sm text-red-800">
              {user.rejectionReason ||
                '사유가 기재되지 않았습니다. 관리자에게 문의하세요.'}
            </p>
          </div>

          <p className="text-sm text-gray-500 mb-6">
            프로필을 수정하여 다시 승인을 요청하실 수 있습니다.
          </p>

          <button
            onClick={handleReapply}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition"
          >
            정보 수정 및 재신청하기
          </button>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full mt-2 py-2 text-sm text-gray-500 hover:text-red-500 transition"
          >
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // 5. 대기 중 (PENDING) 또는 GUEST 상태 렌더링
  // -------------------------------------------------------
  // (GUEST 상태여도 여기서 보여주면 사용자가 혼란스럽지 않음)

  const userName = user.name || '정보 없음';
  const userOrganization = user.organization || '정보 없음';
  const userPhoneNumber = user.phoneNumber || '정보 없음';

  return (
    <div className="p-4 flex justify-center items-start min-h-screen bg-gray-50">
      <div className="w-full max-w-md mt-10 p-8 rounded-xl shadow-lg bg-white border border-gray-200">
        <h1 className="text-3xl font-extrabold text-yellow-600 mb-4">
          ⏳ 승인 대기 중
        </h1>
        <p className="text-base text-gray-700 mb-6">
          관리자(<strong>{userName}</strong>)님의 계정 승인을 요청했습니다.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          마스터 관리자가 검토 후 승인할 예정입니다. 승인이 완료될 때까지 잠시
          기다려주세요.
        </p>

        <div className="text-left bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
          <p className="text-sm mb-1">
            <strong>소속:</strong> {userOrganization}
          </p>
          <p className="text-sm">
            <strong>연락처:</strong> {userPhoneNumber}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => window.location.reload()}
            className="w-full py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition"
          >
            상태 새로고침
          </button>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full py-2 text-gray-400 hover:text-gray-600 text-sm transition"
          >
            로그아웃
          </button>
        </div>

        <p className="text-xs text-red-500 mt-4 text-center">
          승인 관련 문의는 마스터 관리자에게 연락하세요.
        </p>
      </div>
    </div>
  );
}
