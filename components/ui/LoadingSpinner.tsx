import styles from './LoadingSpinner.module.css';

export default function LoadingSpinner() {
  return (
    <div className={styles.container}>
      <div className={styles.spinner} />
      {/* 텍스트가 필요 없다면 아래 줄은 지우셔도 됩니다 */}
      <p className={styles.text}>데이터를 불러오는 중입니다...</p>
    </div>
  );
}
