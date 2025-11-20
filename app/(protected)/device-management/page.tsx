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
import { Wheelchair } from '@/entities/Wheelchair';
import { User } from '@/entities/User';
import { DeviceAuth } from '@/entities/DeviceAuth';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

// 타입 정의
type DeviceView = Pick<
  Wheelchair,
  'id' | 'deviceSerial' | 'modelName' | 'createdAt' | 'physicalStatus'
> & {
  registeredBy: Pick<User, 'id' | 'name' | 'email'>;
  deviceAuth: Pick<DeviceAuth, 'id' | 'deviceId'> | null;
};

export default function DeviceManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // --- 상태 관리 ---
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 알림 메시지 상태
  const [lastAction, setLastAction] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // 기기 등록 폼 상태
  const [formState, setFormState] = useState({
    deviceSerial: '',
    modelName: '',
    deviceId: '',
    password: '',
    confirmPassword: '',
  });

  // Caps Lock 및 로딩 상태
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 🚨 삭제 모달 상태 관리
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    targetId: number | null;
    targetSerial: string;
  }>({ isOpen: false, targetId: null, targetSerial: '' });

  // 1. 권한 확인 & 데이터 로딩
  useEffect(() => {
    if (
      status === 'authenticated' &&
      (session.user.role === 'ADMIN' || session.user.role === 'MASTER')
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

  // 2. 폼 핸들러
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

  // 3. 기기 등록 핸들러
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

  // 4. 삭제 모달 열기
  const openDeleteModal = (id: number, serial: string) => {
    setDeleteModal({ isOpen: true, targetId: id, targetSerial: serial });
  };

  // 5. 실제 삭제 실행
  const confirmDelete = async () => {
    const { targetId, targetSerial } = deleteModal;
    if (!targetId) return;

    // 🔍 디버깅용: 콘솔에서 삭제되는 ID 확인
    console.log(`Deleting Device - ID: ${targetId}, Serial: ${targetSerial}`);

    setIsLoading(true);
    setLastAction(null);
    setDeleteModal({ isOpen: false, targetId: null, targetSerial: '' }); // 모달 닫기

    try {
      const res = await fetch(`/api/admin/devices/${targetId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || '삭제 실패');
      }

      setLastAction({
        type: 'success',
        message: data.message || `기기(${targetSerial})가 삭제되었습니다.`,
      });
      fetchDevices(); // 목록 갱신
    } catch (err: any) {
      setLastAction({ type: 'error', message: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // 6. UI 렌더링
  if (
    status !== 'authenticated' ||
    (session.user.role !== 'ADMIN' && session.user.role !== 'MASTER')
  ) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>권한 확인 중...</h1>
      </div>
    );
  }

  const isPasswordMismatch =
    formState.password &&
    formState.confirmPassword &&
    formState.password !== formState.confirmPassword;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>기기 관리 (ADMIN)</h1>
      <p className={styles.subtitle}>
        새 휠체어 기기를 등록하고, 기기 로그인 계정을 생성합니다.
      </p>

      {lastAction && (
        <div className={`${styles.actionMessage} ${styles[lastAction.type]}`}>
          {lastAction.message}
        </div>
      )}

      <div className={styles.formContainer}>
        <h2 className={styles.sectionTitle}>신규 기기 등록</h2>
        <form onSubmit={handleRegister} className={styles.form}>
          <div className={styles.formGrid}>
            <div className={styles.inputGroup}>
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
              />
            </div>
            <div className={styles.inputGroup}>
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
              />
            </div>
            <div className={styles.inputGroup}>
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
              />
            </div>
            <div
              className={styles.inputGroup}
              style={{ visibility: 'hidden' }}
            ></div>
            <div className={styles.inputGroup}>
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
              />
            </div>
            <div className={styles.inputGroup}>
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
                className={isPasswordMismatch ? styles.inputError : ''}
              />
              {isPasswordMismatch && (
                <span className={styles.validationMessage}>
                  비밀번호가 일치하지 않습니다.
                </span>
              )}
            </div>
          </div>
          {isCapsLockOn && (
            <div className={styles.capsLockWarning}>
              ⚠️ Caps Lock이 켜져 있습니다.
            </div>
          )}
          {formError && <p className={styles.error}>{formError}</p>}
          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? '등록 중...' : '신규 기기 등록'}
            </button>
          </div>
        </form>
      </div>

      <div className={styles.tableContainer}>
        <h2 className={styles.sectionTitle}>등록된 기기 목록</h2>
        {isLoading && <LoadingSpinner />}
        {error && (
          <p className={`${styles.actionMessage} ${styles.error}`}>{error}</p>
        )}

        {!isLoading && !error && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>기기 시리얼</th>
                <th>모델명</th>
                <th>기기 ID</th>
                <th>상태</th>
                <th>등록자</th>
                <th>등록일</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>
                    등록된 기기가 없습니다.
                  </td>
                </tr>
              ) : (
                devices.map((device) => (
                  <tr key={device.id}>
                    <td>{device.id}</td>
                    <td>{device.deviceSerial}</td>
                    <td>{device.modelName}</td>
                    <td>{device.deviceAuth?.deviceId || 'N/A'}</td>
                    <td>{device.physicalStatus}</td>
                    <td>{device.registeredBy.name || '-'}</td>
                    <td>{new Date(device.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className={`${styles.actionButton} ${styles.deleteButton}`}
                        onClick={() =>
                          openDeleteModal(device.id, device.deviceSerial)
                        }
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 🚨 삭제 확인 모달 */}
      {deleteModal.isOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>기기 삭제 확인</h3>
            <p className={styles.modalText}>
              기기 <strong>{deleteModal.targetSerial}</strong>을(를)
              삭제하시겠습니까?
              <br />
              삭제된 데이터는 복구할 수 없습니다.
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.cancelButton}
                onClick={() =>
                  setDeleteModal({
                    isOpen: false,
                    targetId: null,
                    targetSerial: '',
                  })
                }
              >
                취소
              </button>
              <button
                className={styles.confirmDeleteButton}
                onClick={confirmDelete}
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
