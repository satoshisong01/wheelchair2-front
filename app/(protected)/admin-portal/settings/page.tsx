'use client';

// 📍 경로: app/(protected)/admin-portal/settings/page.tsx
// 🔒 [uc_auth_11] MASTER 전용 — 로그인 화면 시스템 사용 알림 문구 설정 (저장은 /api/settings/login-banner PUT)
//   '/admin' 경로라 미들웨어가 비로그인('/')·기기 사용자('/mobile-view')를 먼저 돌려보냄

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import styles from './page.module.css';

const MAX_LENGTH = 500; // 서버 검증(LOGIN_BANNER_MAX_LENGTH)과 같은 상한

interface Notice {
  type: 'ok' | 'error';
  text: string;
}

export default function SystemSettingsPage() {
  const { data: session, status } = useSession();
  const isMaster = session?.user?.role === 'MASTER';

  const [text, setText] = useState('');
  const [defaultText, setDefaultText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !isMaster) return;
    let cancelled = false;
    (async () => {
      try {
        // 저장 직후 다시 열어도 최신 값을 보도록 브라우저 캐시를 쓰지 않음
        const res = await fetch('/api/settings/login-banner', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        setText(typeof data.text === 'string' ? data.text : '');
        setDefaultText(typeof data.defaultText === 'string' ? data.defaultText : '');
      } catch (error) {
        console.error('Login banner load failed:', error);
        if (!cancelled) setNotice({ type: 'error', text: '현재 문구를 불러오지 못했습니다.' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, isMaster]);

  const handleSave = async () => {
    if (!text.trim()) {
      setNotice({ type: 'error', text: '알림 문구를 입력해주세요.' });
      return;
    }
    if (!confirm('로그인 화면 알림 문구를 저장하시겠습니까?')) return;

    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/settings/login-banner', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: 'error', text: data.message || '저장에 실패했습니다.' });
        return;
      }
      setText(typeof data.text === 'string' ? data.text : text);
      setNotice({ type: 'ok', text: '저장되었습니다. 로그인 화면에는 1분 안에 반영됩니다.' });
    } catch (error) {
      console.error('Login banner save failed:', error);
      setNotice({ type: 'error', text: '저장 중 오류가 발생했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') return <LoadingSpinner />;

  if (!isMaster) {
    return <div className="p-8 text-center">접근 권한이 없습니다.</div>;
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>로그인 화면 알림 문구 설정</h1>
      <p className={styles.description}>
        기기 로그인 화면과 관리자 로그인 화면에서 로그인 전 모든 사용자에게 보이는 시스템 사용 알림
        문구입니다. 입력한 글자 그대로 표시되며(HTML 미적용), 최대 {MAX_LENGTH}자까지 저장할 수
        있습니다. 변경 내역은 감사 로그에 남습니다.
      </p>

      {loading ? (
        <div className={styles.loadingText}>현재 문구를 불러오는 중...</div>
      ) : (
        <>
          <textarea
            className={styles.textarea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_LENGTH}
            rows={6}
            aria-label="로그인 화면 알림 문구"
          />
          <div className={styles.counter}>
            {text.length} / {MAX_LENGTH}
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setText(defaultText)}
              disabled={saving || !defaultText}
            >
              기본 문구로 되돌리기
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </>
      )}

      {notice && (
        <p className={notice.type === 'ok' ? styles.noticeOk : styles.noticeError}>{notice.text}</p>
      )}
    </div>
  );
}
