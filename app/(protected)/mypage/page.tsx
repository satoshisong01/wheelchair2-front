'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';
import { useSession } from 'next-auth/react';
import { validatePassword, PASSWORD_POLICY_MESSAGE } from '@/lib/password'; // 🔒 [IA-05] 비밀번호 강도 검증

// 알림 설정 UI 표시 여부 (관리자가 기기관리 페이지에서 일괄 제어하므로 일시 숨김)
// 다시 노출하려면 true로 변경
const SHOW_NOTIFICATION_SETTINGS = false;

export default function MyPage() {
  const { data: session, update } = useSession();
  const userRole = session?.user?.role;
  const isDeviceUser = userRole === 'DEVICE_USER';
  const wheelchairId = session?.user?.wheelchairId;
  // 비밀번호가 있는 계정 = 기기 계정(device_auths). KTC 관리자 테스트 계정처럼 role=ADMIN인 기기 계정 포함
  const hasDevicePassword = Boolean(session?.user?.deviceId);
  // 🔒 [uc_auth_04] 초기 비밀번호 변경 전 — middleware가 이 화면(/mypage?force=1) 외 접근을 막는다
  const mustChangePassword = session?.user?.mustChangePassword === true;

  const [deviceSerial, setDeviceSerial] = useState<string>('-');
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCapsLock, setIsCapsLock] = useState(false);

  // 🟢 알림 설정 상태
  const [notifications, setNotifications] = useState({
    emergency: true,
    battery: true,
    posture: true,
  });

  // 🟢 초기 설정값 로딩 (초기 비밀번호 변경 전엔 데이터 API가 막혀 있어 생략)
  useEffect(() => {
    const fetchSettings = async () => {
      if (!isDeviceUser || !wheelchairId || mustChangePassword) return;
      try {
        const res = await fetch('/api/device-info');
        if (res.ok) {
          const data = await res.json();
          if (data.serial) setDeviceSerial(data.serial);
          if (data.status) {
            setNotifications({
              emergency: data.status.push_emergency ?? true,
              battery: data.status.push_battery ?? true,
              posture: data.status.push_posture ?? true,
            });
          }
        }
      } catch (err) {
        console.error('설정 로딩 실패:', err);
      }
    };
    fetchSettings();
  }, [isDeviceUser, wheelchairId, mustChangePassword]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const checkCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setIsCapsLock(e.getModifierState('CapsLock'));
  };

  // 🟢 알림 토글 핸들러 (API 연동)
  const toggleNotification = async (type: 'emergency' | 'battery' | 'posture') => {
    const nextEnabled = !notifications[type];
    setNotifications((prev) => ({ ...prev, [type]: nextEnabled }));

    try {
      const res = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wheelchairId, type, enabled: nextEnabled }),
      });
      if (!res.ok) throw new Error();
    } catch (err) {
      alert('설정 저장 실패');
      setNotifications((prev) => ({ ...prev, [type]: !nextEnabled }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setIsError(false);

    if (formData.newPassword !== formData.confirmPassword) {
      setIsError(true);
      setMessage('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    const pwCheck = validatePassword(formData.newPassword);
    if (!pwCheck.ok) {
      setIsError(true);
      setMessage(pwCheck.message || '비밀번호 정책을 확인해주세요.');
      return;
    }
    if (formData.newPassword === formData.currentPassword) {
      setIsError(true);
      setMessage('현재 비밀번호와 다른 비밀번호를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || '오류 발생');
      setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setIsError(false);
      if (mustChangePassword) {
        // 서버가 DB에서 플래그를 다시 읽어 토큰을 갱신(클라이언트 값은 보내지 않음)한 뒤 서비스 화면으로
        setMessage('비밀번호가 변경되었습니다. 서비스 화면으로 이동합니다.');
        await update();
        window.location.replace('/mobile-view');
        return;
      }
      setMessage('비밀번호가 성공적으로 변경되었습니다.');
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : '오류 발생');
    } finally {
      setIsLoading(false);
    }
  };

  const passwordForm = (
    <div className={styles.formCard} style={mustChangePassword ? { marginBottom: '20px' } : undefined}>
      <h3>{mustChangePassword ? '초기 비밀번호 변경' : '비밀번호 변경'}</h3>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label>현재 비밀번호</label>
          <input
            type="password"
            name="currentPassword"
            value={formData.currentPassword}
            onChange={handleChange}
            onKeyUp={checkCapsLock}
            placeholder="현재 비밀번호 입력"
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label>수정할 비밀번호</label>
          <input
            type="password"
            name="newPassword"
            value={formData.newPassword}
            onChange={handleChange}
            onKeyUp={checkCapsLock}
            placeholder="새로운 비밀번호"
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label>수정할 비밀번호 재확인</label>
          <input
            type="password"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            onKeyUp={checkCapsLock}
            placeholder="새로운 비밀번호 확인"
            required
          />
        </div>
        {isCapsLock && <p className={styles.capsLockWarning}>⚠️ Caps Lock이 켜져 있습니다.</p>}
        {message && <p className={isError ? styles.errorMsg : styles.successMsg}>{message}</p>}
        <button type="submit" className={styles.submitBtn} disabled={isLoading}>
          {isLoading ? '변경 중...' : '비밀번호 변경'}
        </button>
      </form>
    </div>
  );

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>마이페이지</h1>

      {/* 🔒 [uc_auth_04] 초기 비밀번호 변경 안내와 변경 폼을 맨 위에 */}
      {mustChangePassword && (
        <>
          <div
            role="alert"
            style={{
              marginBottom: '16px',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid #fde68a',
              backgroundColor: '#fffbeb',
              color: '#92400e',
              lineHeight: 1.6,
            }}
          >
            <strong>초기 비밀번호를 바꿔야 서비스를 이용할 수 있습니다.</strong>
            <br />
            {PASSWORD_POLICY_MESSAGE}
          </div>
          {passwordForm}
        </>
      )}

      <div className={styles.profileBox}>
        <div className={styles.profileInfo}>
          <p>
            <strong>접속 계정:</strong>{' '}
            {session?.user?.email || session?.user?.deviceId || '정보 없음'}
          </p>
          <p>
            <strong>권한:</strong> {userRole}
          </p>
          {isDeviceUser && (
            <p style={{ marginTop: '10px', fontSize: '1.1em', color: '#27b4e9' }}>
              <strong>기기 시리얼 (S/N): {deviceSerial}</strong>
            </p>
          )}
        </div>
      </div>

      {SHOW_NOTIFICATION_SETTINGS && (
        <div className={styles.formCard} style={{ marginBottom: '20px' }}>
          <h3>알림 설정</h3>
          <div className={styles.notificationList}>
            <div className={styles.notificationItem}>
              <div className={styles.notiText}>
                <span className={styles.notiTitle}>🚨 긴급 위험 알림</span>
                <span className={styles.notiDesc}>낙상 사고, 전복 위험, 장애물 감지</span>
              </div>
              <div
                className={`${styles.toggleSwitch} ${notifications.emergency ? styles.on : ''}`}
                onClick={() => toggleNotification('emergency')}
              >
                <div className={styles.toggleHandle} />
              </div>
            </div>
            <div className={styles.notificationItem}>
              <div className={styles.notiText}>
                <span className={styles.notiTitle}>🔋 배터리 관리 알림</span>
                <span className={styles.notiDesc}>배터리 저전압 및 충전 필요 알림</span>
              </div>
              <div
                className={`${styles.toggleSwitch} ${notifications.battery ? styles.on : ''}`}
                onClick={() => toggleNotification('battery')}
              >
                <div className={styles.toggleHandle} />
              </div>
            </div>
            <div className={styles.notificationItem}>
              <div className={styles.notiText}>
                <span className={styles.notiTitle}>🧘 욕창 방지 알림</span>
                <span className={styles.notiDesc}>15분 이상 동일 자세 유지 시 교정 알림</span>
              </div>
              <div
                className={`${styles.toggleSwitch} ${notifications.posture ? styles.on : ''}`}
                onClick={() => toggleNotification('posture')}
              >
                <div className={styles.toggleHandle} />
              </div>
            </div>
          </div>
        </div>
      )}

      {!mustChangePassword &&
        (hasDevicePassword ? (
          passwordForm
        ) : (
          <div className={styles.infoCard}>
            <p>💡 관리자(카카오 로그인) 계정은 비밀번호 변경이 불필요합니다.</p>
          </div>
        ))}
    </div>
  );
}
