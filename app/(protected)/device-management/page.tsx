// app/(protected)/device-management/page.tsx
'use client';

import {
  useState,
  useEffect,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
} from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

type DeviceView = {
  id: string;
  device_serial: string;
  model_name: string;
  device_id: string;
  created_at: string;
  registered_by_name: string | null;
  registered_by_email: string | null;
  push_emergency: boolean | null;
  push_battery: boolean | null;
  push_posture: boolean | null;
};

type NotificationType = 'emergency' | 'battery' | 'posture';

const NOTIFICATION_META: Record<
  NotificationType,
  { key: 'push_emergency' | 'push_battery' | 'push_posture'; label: string; icon: string }
> = {
  emergency: { key: 'push_emergency', label: '긴급', icon: '🚨' },
  battery: { key: 'push_battery', label: '배터리', icon: '🔋' },
  posture: { key: 'push_posture', label: '욕창', icon: '🧘' },
};

const LoadingSpinner = () => (
  <div className={styles.loadingSpinner}>데이터 로딩 중...</div>
);

export default function DeviceManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [formState, setFormState] = useState({
    deviceSerial: '',
    modelName: '',
    deviceId: '',
    password: '',
    confirmPassword: '',
    userGender: '' as '' | 'M' | 'F',
    userWeight: '',
  });

  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    targetId: string | null;
    targetSerial: string;
  }>({ isOpen: false, targetId: null, targetSerial: '' });

  // 삭제 확인용 입력값 (시리얼 + 확인 문구)
  const [deleteConfirm, setDeleteConfirm] = useState({
    serialInput: '',
    phraseInput: '',
  });

  const CONFIRM_PHRASE = '삭제합니다';

  useEffect(() => {
    if (
      status === 'authenticated' &&
      (session?.user.role === 'ADMIN' || session?.user.role === 'MASTER')
    ) {
      fetchDevices();
    }
  }, [status, session]);

  const fetchDevices = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/devices');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.message || '기기 목록을 불러오는 데 실패했습니다.'
        );
      }
      const data = await res.json();
      setDevices(data);
    } catch (err: any) {
      console.error('Fetch Error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
    if (formError) setFormError(null);
  };

  const handleGenderChange = (value: 'M' | 'F') => {
    setFormState((prev) => ({ ...prev, userGender: value }));
    if (formError) setFormError(null);
  };

  const checkCapsLock = (
    e: KeyboardEvent<HTMLInputElement> | MouseEvent<HTMLInputElement>
  ) => {
    if (e.getModifierState) setIsCapsLockOn(e.getModifierState('CapsLock'));
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    setLastAction(null);

    if (formState.password !== formState.confirmPassword) {
      setFormError('비밀번호가 일치하지 않습니다.');
      setIsSubmitting(false);
      return;
    }

    if (formState.password.length < 6) {
      setFormError('비밀번호는 최소 6자 이상이어야 합니다.');
      setIsSubmitting(false);
      return;
    }

    try {
      const { confirmPassword, ...submitData } = formState;
      const res = await fetch('/api/admin/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || '등록 실패');

      setLastAction({ type: 'success', message: '새 기기가 등록되었습니다.' });
      setFormState({
        deviceSerial: '',
        modelName: '',
        deviceId: '',
        password: '',
        confirmPassword: '',
        userGender: '',
        userWeight: '',
      });
      fetchDevices();
    } catch (err: any) {
      setFormError(err.message);
      setLastAction({ type: 'error', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 관리자: 특정 기기의 특정 알림 ON/OFF 토글
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleNotification = async (
    deviceId: string,
    type: NotificationType,
    currentEnabled: boolean | null
  ) => {
    const nextEnabled = !(currentEnabled ?? true);
    const togglingKey = `${deviceId}:${type}`;
    setTogglingId(togglingKey);

    // 낙관적 업데이트
    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId
          ? { ...d, [NOTIFICATION_META[type].key]: nextEnabled }
          : d
      )
    );

    try {
      const res = await fetch(
        `/api/admin/devices/${deviceId}/notifications`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, enabled: nextEnabled }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || '알림 설정 변경 실패');
      }

      setLastAction({
        type: 'success',
        message: `${NOTIFICATION_META[type].icon} ${NOTIFICATION_META[type].label} 알림 ${nextEnabled ? 'ON' : 'OFF'}`,
      });
    } catch (err: any) {
      // 롤백
      setDevices((prev) =>
        prev.map((d) =>
          d.id === deviceId
            ? { ...d, [NOTIFICATION_META[type].key]: currentEnabled }
            : d
        )
      );
      setLastAction({ type: 'error', message: err.message });
    } finally {
      setTogglingId(null);
    }
  };

  const openDeleteModal = (id: string, serial: string) => {
    setDeleteModal({ isOpen: true, targetId: id, targetSerial: serial });
    setDeleteConfirm({ serialInput: '', phraseInput: '' });
  };

  const closeDeleteModal = () => {
    setDeleteModal({ isOpen: false, targetId: null, targetSerial: '' });
    setDeleteConfirm({ serialInput: '', phraseInput: '' });
  };

  const isDeleteConfirmValid =
    deleteModal.isOpen &&
    deleteConfirm.serialInput.trim() === deleteModal.targetSerial &&
    deleteConfirm.phraseInput.trim() === CONFIRM_PHRASE;

  const confirmDelete = async () => {
    const { targetId, targetSerial } = deleteModal;
    if (!targetId) return;
    if (!isDeleteConfirmValid) return;

    setIsLoading(true);
    setLastAction(null);
    closeDeleteModal();

    try {
      const res = await fetch(`/api/admin/devices`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wheelchairId: targetId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || '삭제 실패');
      }

      setLastAction({
        type: 'success',
        message: data.message || `기기(${targetSerial})가 삭제되었습니다.`,
      });
      fetchDevices();
    } catch (err: any) {
      setLastAction({ type: 'error', message: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  if (
    status !== 'authenticated' ||
    (session?.user.role !== 'ADMIN' && session?.user.role !== 'MASTER')
  ) {
    return (
      <div className={styles.unauthorized}>
        <h1>권한 확인 중...</h1>
        <p>ADMIN 또는 MASTER만 접근 가능합니다.</p>
      </div>
    );
  }

  const isPasswordMismatch =
    formState.password &&
    formState.confirmPassword &&
    formState.password !== formState.confirmPassword;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>기기 관리 ({session?.user.role})</h1>
        <p>새 휠체어 기기를 등록하고, 기기 로그인 계정을 생성합니다.</p>
      </header>

      {lastAction && (
        <div className={`${styles.alert} ${styles[lastAction.type]}`}>
          {lastAction.message}
        </div>
      )}

      <div className={styles.mainContent}>
        <section className={styles.formSection}>
          <h2>신규 기기 등록</h2>
          <form onSubmit={handleRegister} className={styles.form}>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label htmlFor="deviceSerial">기기 시리얼 (S/N)</label>
                <input
                  id="deviceSerial"
                  name="deviceSerial"
                  type="text"
                  value={formState.deviceSerial}
                  onChange={handleFormChange}
                  required
                  disabled={isSubmitting}
                  placeholder="예: 01222611455"
                  className={styles.input}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="modelName">모델명</label>
                <input
                  id="modelName"
                  name="modelName"
                  type="text"
                  value={formState.modelName}
                  onChange={handleFormChange}
                  required
                  disabled={isSubmitting}
                  placeholder="예: 휠체어1234"
                  className={styles.input}
                />
              </div>
              <div className={styles.formGroup}>
                <label>사용자 성별</label>
                <div className={styles.radioGroup}>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="userGender"
                      value="M"
                      checked={formState.userGender === 'M'}
                      onChange={() => handleGenderChange('M')}
                      disabled={isSubmitting}
                    />
                    <span>남성</span>
                  </label>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="userGender"
                      value="F"
                      checked={formState.userGender === 'F'}
                      onChange={() => handleGenderChange('F')}
                      disabled={isSubmitting}
                    />
                    <span>여성</span>
                  </label>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="userWeight">사용자 몸무게 (kg)</label>
                <input
                  id="userWeight"
                  name="userWeight"
                  type="number"
                  min={1}
                  max={300}
                  step={0.1}
                  value={formState.userWeight}
                  onChange={handleFormChange}
                  disabled={isSubmitting}
                  placeholder="예: 65"
                  className={styles.input}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="deviceId">기기 로그인 ID</label>
                <input
                  id="deviceId"
                  name="deviceId"
                  type="text"
                  value={formState.deviceId}
                  onChange={handleFormChange}
                  required
                  disabled={isSubmitting}
                  placeholder="기기 전용 ID"
                  className={styles.input}
                />
              </div>
              <div />
              <div className={styles.formGroup}>
                <label htmlFor="password">초기 비밀번호</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={formState.password}
                  onChange={handleFormChange}
                  onKeyDown={checkCapsLock}
                  onKeyUp={checkCapsLock}
                  onClick={checkCapsLock}
                  required
                  disabled={isSubmitting}
                  placeholder="비밀번호 입력"
                  className={styles.input}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="confirmPassword">비밀번호 확인</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={formState.confirmPassword}
                  onChange={handleFormChange}
                  onKeyDown={checkCapsLock}
                  onKeyUp={checkCapsLock}
                  onClick={checkCapsLock}
                  required
                  disabled={isSubmitting}
                  placeholder="비밀번호 재입력"
                  className={
                    isPasswordMismatch ? styles.inputError : styles.input
                  }
                />
                {isPasswordMismatch && (
                  <span className={styles.errorText}>
                    비밀번호가 일치하지 않습니다.
                  </span>
                )}
              </div>
            </div>
            {isCapsLockOn && (
              <div className={styles.capsLock}>
                ⚠️ Caps Lock이 켜져 있습니다.
              </div>
            )}
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.formActions}>
              <button
                type="submit"
                disabled={isSubmitting || isPasswordMismatch}
                className={styles.submitButton}
              >
                {isSubmitting ? '등록 중...' : '신규 기기 등록'}
              </button>
            </div>
          </form>
        </section>

        <section className={styles.listSection}>
          <h2>등록된 기기 목록</h2>
          {isLoading && <LoadingSpinner />}
          {error && <div className={styles.errorBox}>{error}</div>}
          {!isLoading && !error && (
            <table className={styles.table}>
              <colgroup>
                <col style={{ width: '19%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>기기 시리얼</th>
                  <th>모델명</th>
                  <th>등록자</th>
                  <th>등록일</th>
                  <th>알림 설정</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>
                      등록된 기기가 없습니다.
                    </td>
                  </tr>
                ) : (
                  devices.map((device) => (
                    <tr key={device.id}>
                      <td>{device.device_serial}</td>
                      <td>{device.model_name}</td>
                      <td>{device.registered_by_name || '-'}</td>
                      <td>
                        {new Date(device.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div className={styles.badgeGroup}>
                          {(['emergency', 'battery', 'posture'] as NotificationType[]).map(
                            (type) => {
                              const meta = NOTIFICATION_META[type];
                              const enabled = (device[meta.key] ?? true) === true;
                              const isPending =
                                togglingId === `${device.id}:${type}`;
                              return (
                                <button
                                  key={type}
                                  onClick={() =>
                                    toggleNotification(
                                      device.id,
                                      type,
                                      device[meta.key]
                                    )
                                  }
                                  disabled={isPending}
                                  title={`${meta.icon} ${meta.label} 알림 ${enabled ? 'ON' : 'OFF'}`}
                                  className={`${styles.badge} ${
                                    enabled
                                      ? type === 'emergency'
                                        ? styles.badgeEmergencyOn
                                        : type === 'battery'
                                          ? styles.badgeBatteryOn
                                          : styles.badgePostureOn
                                      : styles.badgeOff
                                  }`}
                                >
                                  {meta.icon} {meta.label}{' '}
                                  {enabled ? 'ON' : 'OFF'}
                                </button>
                              );
                            }
                          )}
                        </div>
                      </td>
                      <td>
                        <button
                          onClick={() =>
                            openDeleteModal(device.id, device.device_serial)
                          }
                          className={styles.deleteButton}
                        >
                          ❌ 삭제
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {deleteModal.isOpen && (
        <div
          className={styles.modalOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeDeleteModal();
            }
          }}
        >
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>기기 삭제 확인</h3>
            <p className={styles.modalText}>
              기기 <strong>{deleteModal.targetSerial}</strong>을(를)
              <br />
              삭제하시겠습니까? 삭제된 데이터는 복구할 수 없습니다.
            </p>

            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <div className={styles.formGroup} style={{ marginBottom: 12 }}>
                <label
                  htmlFor="confirmSerial"
                  style={{ fontSize: 13, color: '#555' }}
                >
                  기기 시리얼 번호를 입력하세요 (
                  <strong>{deleteModal.targetSerial}</strong>)
                </label>
                <input
                  id="confirmSerial"
                  type="text"
                  value={deleteConfirm.serialInput}
                  onChange={(e) =>
                    setDeleteConfirm((prev) => ({
                      ...prev,
                      serialInput: e.target.value,
                    }))
                  }
                  autoComplete="off"
                  placeholder={deleteModal.targetSerial}
                  className={styles.input}
                  style={{ marginTop: 4 }}
                />
              </div>

              <div className={styles.formGroup}>
                <label
                  htmlFor="confirmPhrase"
                  style={{ fontSize: 13, color: '#555' }}
                >
                  확인을 위해 <strong>{CONFIRM_PHRASE}</strong>를 입력하세요
                </label>
                <input
                  id="confirmPhrase"
                  type="text"
                  value={deleteConfirm.phraseInput}
                  onChange={(e) =>
                    setDeleteConfirm((prev) => ({
                      ...prev,
                      phraseInput: e.target.value,
                    }))
                  }
                  autoComplete="off"
                  placeholder={CONFIRM_PHRASE}
                  className={styles.input}
                  style={{ marginTop: 4 }}
                />
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                onClick={closeDeleteModal}
                className={styles.cancelButton}
              >
                취소
              </button>
              <button
                onClick={confirmDelete}
                disabled={!isDeleteConfirmValid}
                className={styles.confirmButton}
                style={{
                  opacity: isDeleteConfirmValid ? 1 : 0.4,
                  cursor: isDeleteConfirmValid ? 'pointer' : 'not-allowed',
                }}
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
