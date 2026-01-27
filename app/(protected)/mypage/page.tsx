'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';
import { useSession } from 'next-auth/react';

export default function MyPage() {
  const { data: session } = useSession();
  const userRole = session?.user?.role;
  const isDeviceUser = userRole === 'DEVICE_USER';
  const wheelchairId = (session?.user as any)?.wheelchairId;

  // 시리얼 번호 상태
  const [deviceSerial, setDeviceSerial] = useState<string>('-');

  // 폼 상태
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 🟢 Caps Lock 감지 상태
  const [isCapsLock, setIsCapsLock] = useState(false);

  // 🟢 [추가] 알림 설정 상태 (나중에 DB 연결)
  const [notifications, setNotifications] = useState({
    emergency: true, // 낙상, 전복, 장애물 (긴급 위험)
    battery: true, // 저전압 알림 (기본 관리) - [추가]
    posture: true, // 욕창 방지 알림 (정기 관리)
  });

  // 기기 사용자라면 시리얼 번호 불러오기
  useEffect(() => {
    const fetchSerial = async () => {
      if (!isDeviceUser) return;
      try {
        const res = await fetch('/api/device-info');
        if (res.ok) {
          const data = await res.json();
          if (data.serial) {
            setDeviceSerial(data.serial);
          }
        }
      } catch (err) {
        console.error('시리얼 번호 로딩 실패:', err);
      }
    };
    fetchSerial();
  }, [isDeviceUser]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // 🟢 키 입력 시 CapsLock 상태 확인 핸들러
  const checkCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.getModifierState('CapsLock')) {
      setIsCapsLock(true);
    } else {
      setIsCapsLock(false);
    }
  };

  // 🟢 [추가] 알림 토글 핸들러
  const toggleNotification = (type: 'emergency' | 'battery' | 'posture') => {
    setNotifications((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
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
    if (formData.newPassword.length < 4) {
      setIsError(true);
      setMessage('비밀번호는 최소 4자 이상이어야 합니다.');
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

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || '오류가 발생했습니다.');
      }

      setMessage('비밀번호가 성공적으로 변경되었습니다.');
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setIsError(false);
    } catch (error: any) {
      setIsError(true);
      setMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>마이페이지</h1>

      {/* 1. 프로필 정보 */}
      <div className={styles.profileBox}>
        <div className={styles.profileInfo}>
          <p>
            <strong>접속 계정:</strong>{' '}
            {session?.user?.email || (session?.user as any)?.deviceId || '정보 없음'}
          </p>
          <p>
            <strong>권한:</strong> {userRole}
          </p>
          {isDeviceUser && (
            <p
              style={{
                marginTop: '10px',
                fontSize: '1.1em',
                color: '#27b4e9',
              }}
            >
              <strong>기기 시리얼 (S/N): {deviceSerial}</strong>
            </p>
          )}
        </div>
      </div>

      {/* 2. 🟢 [추가] 알림 설정 섹션 (UI만 구현) */}
      <div className={styles.formCard} style={{ marginBottom: '20px' }}>
        <h3>알림 설정</h3>
        <div className={styles.notificationList}>
          {/* 1. 긴급 위험 알림 (낙상/전복/장애물) */}
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

          {/* 2. 배터리 관리 알림 (저전압) - [독립 분리] */}
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

          {/* 3. 욕창 방지 알림 (자세 교정) */}
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

      {/* 3. 비밀번호 변경 폼 */}
      {isDeviceUser ? (
        <div className={styles.formCard}>
          <h3>비밀번호 변경</h3>
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
      ) : (
        <div className={styles.infoCard}>
          <p>💡 관리자(카카오 로그인) 계정은 비밀번호 변경이 불필요합니다.</p>
        </div>
      )}
    </div>
  );
}
