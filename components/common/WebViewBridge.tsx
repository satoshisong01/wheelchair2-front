'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function WebViewBridge() {
  const { data: session } = useSession();

  useEffect(() => {
    // ✅ [원상복구] 앱 환경일 때만 전송하도록 조건문 복원
    if (session?.user && (window as any).ReactNativeWebView) {
      const userId = session.user.id;

      console.log(`📱 [Web -> App] 로그인 정보 전송: ${userId}`);

      // 앱으로 쪽지 발송
      (window as any).ReactNativeWebView.postMessage(
        JSON.stringify({
          type: 'LOGIN_SUCCESS',
          userId: userId,
        }),
      );
    }
  }, [session]);

  return null;
}
