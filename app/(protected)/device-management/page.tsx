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
  });

  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    targetId: string | null;
    targetSerial: string;
  }>({ isOpen: false, targetId: null, targetSerial: '' });

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
      });
      fetchDevices();
    } catch (err: any) {
      setFormError(err.message);
      setLastAction({ type: 'error', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteModal = (id: string, serial: string) => {
    setDeleteModal({ isOpen: true, targetId: id, targetSerial: serial });
  };

  const confirmDelete = async () => {
    const { targetId, targetSerial } = deleteModal;
    if (!targetId) return;

    setIsLoading(true);
    setLastAction(null);
    setDeleteModal({ isOpen: false, targetId: null, targetSerial: '' });

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
              <thead>
                <tr>
                  {/* <th>ID</th> */}
                  <th>기기 시리얼</th>
                  <th>모델명</th>
                  <th>등록자</th>
                  <th>등록일</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.emptyState}>
                      등록된 기기가 없습니다.
                    </td>
                  </tr>
                ) : (
                  devices.map((device) => (
                    <tr key={device.id}>
                      {/* <td>{device.id.substring(0, 8)}...</td> */}
                      <td>{device.device_serial}</td>
                      <td>{device.model_name}</td>
                      <td>{device.registered_by_name || '-'}</td>
                      <td>
                        {new Date(device.created_at).toLocaleDateString()}
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
              setDeleteModal({
                isOpen: false,
                targetId: null,
                targetSerial: '',
              });
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
            <div className={styles.modalActions}>
              <button
                onClick={() =>
                  setDeleteModal({
                    isOpen: false,
                    targetId: null,
                    targetSerial: '',
                  })
                }
                className={styles.cancelButton}
              >
                취소
              </button>
              <button onClick={confirmDelete} className={styles.confirmButton}>
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
