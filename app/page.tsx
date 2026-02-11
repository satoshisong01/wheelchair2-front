'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 1. 기기 로그인 처리 (이건 여기서 바로 함)
  const handleDeviceLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const res = await signIn('device-login', {
      deviceId,
      password,
      redirect: false,
    });

    if (res?.error) {
      // 🔴 수정된 부분: 에러 코드를 확인해서 한글로 변환
      if (res.error === 'CredentialsSignin') {
        alert('기기 ID 또는 비밀번호가 일치하지 않습니다.');
      } else {
        alert(`로그인 실패: ${res.error}`);
      }
      setLoading(false);
    } else {
      // 로그인 성공 시 미들웨어가 /device-view 등으로 보냄
      router.refresh();
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg">
        {/* 헤더 */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">전동 휠체어 관제 시스템</h1>
          <p className="mt-2 text-sm text-gray-600">서비스 이용을 위해 로그인해주세요.</p>
        </div>

        {/* 1. 기기 로그인 폼 */}
        <form onSubmit={handleDeviceLogin} className="mt-8 space-y-6">
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="device-id" className="sr-only">
                기기 ID
              </label>
              <input
                id="device-id"
                name="deviceId"
                type="text"
                required
                className="relative block w-full rounded-t-md border-0 py-2.5 pl-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="기기 ID (예: S/N-12345)"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                비밀번호
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="relative block w-full rounded-b-md border-0 py-2.5 pl-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
            >
              {loading ? '로그인 중...' : '기기 로그인'}
            </button>
          </div>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-2 text-gray-500">관리자 / 마스터</span>
          </div>
        </div>

        {/* 2. 카카오 로그인 페이지 이동 버튼 (FIX: signIn 아님, router.push 사용) */}
        <div>
          <button
            onClick={() => router.push('/login')}
            className="flex w-full items-center justify-center rounded-md bg-[#FEE500] px-3 py-2.5 text-sm font-semibold text-[#000000] shadow-sm hover:bg-[#FDD835]"
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3c5.523 0 10 4.053 10 9.053 0 2.92-1.536 5.516-3.927 7.156.241 1.25.962 4.095 1.002 4.295a.394.394 0 0 1-.397.464c-.066 0-.13-.016-.188-.047-.323-.172-3.867-2.61-4.48-3.023-.65.09-1.32.14-2.01.14-5.523 0-10-4.053-10-9.053C2 7.053 6.477 3 12 3z" />
            </svg>
            카카오 로그인 & 회원가입
          </button>
        </div>

        {/* 안드로이드 앱 다운로드 */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 mb-2">
            안드로이드 기기에서 앱으로 사용하시려면 아래에서 APK를 다운로드하세요.
          </p>
          <a
            href="/download/app-release.apk"
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            안드로이드 앱 다운로드
          </a>
        </div>
      </div>
    </div>
  );
}
