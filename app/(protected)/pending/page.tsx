'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// 임시 로딩 스피너 컴포넌트 (프로젝트 경로에 맞게 사용)
const LoadingSpinner = () => (
    <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="text-gray-600 mt-3">데이터를 불러오는 중입니다...</p>
        </div>
    </div>
);

export default function PendingPage() {
    const { data: session, status, update } = useSession();
    const router = useRouter();

    // ⭐️ TS Fix 및 데이터 구조 확보
    const user = session?.user as unknown as {
        role: string,
        name: string,
        organization: string,
        phoneNumber: string,
        rejectionReason?: string, // 거절 시에만 존재
    } | undefined;


    // 1. [로직 개선] 승인 완료(USER/ADMIN) 시 즉시 대시보드로 이동 (미들웨어 보조)
    useEffect(() => {
        if (status === 'authenticated') {
            const currentRole = user?.role;
            if (currentRole === 'USER' || currentRole === 'ADMIN' || currentRole === 'MASTER') {
                console.log(`[PENDING-PAGE] 승인된 사용자입니다. 대시보드로 이동.`);
                router.replace('/dashboard');
            }
        }
    }, [status, user, router]);


    // 2. [로딩/권한 체크] 
    if (status === 'loading' || !user || !user.role || user.role === 'GUEST') {
        // GUEST 상태이거나 로딩 중이면 스피너를 보여주고 미들웨어에게 처리를 맡깁니다.
        return <LoadingSpinner />;
    }

    // -------------------------------------------------------
    // ⭐️ 재신청 핸들러 함수 정의 (REJECTED -> GUEST로 역할 변경)
    // -------------------------------------------------------
    const handleReapply = async () => {
        if (!confirm('현재 정보를 초기화하고 프로필 재작성 페이지로 이동하시겠습니까?')) {
            return;
        }
        
        try {
            const res = await fetch('/api/auth/re-apply', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            if (res.ok) {
                // 1. 세션 동기화 (최신 역할: GUEST)
                await update({ role: 'GUEST', rejectionReason: undefined });
                
                // 2. `/welcome` 페이지로 이동하여 프로필 재작성 유도
                alert('재신청을 위해 프로필 작성 페이지로 이동합니다.');
                router.push('/welcome');
            } else {
                alert('재신청 처리 중 오류가 발생했습니다.');
            }
        } catch (error) {
            console.error('Re-apply error:', error);
            alert('재신청 처리 중 서버 오류가 발생했습니다.');
        }
    };


    // -------------------------------------------------------
    // 3. 거절됨 (REJECTED) 상태 렌더링
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
                            {user.rejectionReason || '사유가 기재되지 않았습니다. 관리자에게 문의하세요.'}
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
                        onClick={() => signOut({ callbackUrl: '/login' })}
                        className="w-full mt-2 py-2 text-sm text-gray-500 hover:text-red-500 transition"
                    >
                        로그아웃
                    </button>
                </div>
            </div>
        );
    }
    
    // -------------------------------------------------------
    // 4. 대기 중 (PENDING) 상태 렌더링
    // -------------------------------------------------------
    // PENDING, REJECTED, GUEST, USER/ADMIN 이외의 상태는 여기로 떨어지지 않습니다.
    if (user.role === 'PENDING') {
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
                        마스터 관리자가 검토 후 승인할 예정입니다. 승인이 완료될 때까지 잠시 기다려주세요.
                    </p>
                    
                    <div className="text-left bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
                        <p className="text-sm mb-1">
                            <strong>소속:</strong> {userOrganization}
                        </p>
                        <p className="text-sm">
                            <strong>연락처:</strong> {userPhoneNumber}
                        </p>
                    </div>
                    
                    <p className="text-xs text-red-500 mt-4">
                        승인 관련 문의는 마스터 관리자에게 연락하세요.
                    </p>
                </div>
            </div>
        );
    }
    
    // 안전 장치: 예상치 못한 역할일 경우 로딩 상태 유지 (미들웨어 처리 위임)
    return <LoadingSpinner />;
}