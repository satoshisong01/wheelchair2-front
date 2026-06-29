// app/account-deletion/page.tsx — 계정·데이터 삭제 요청 안내 (Google Play 요구 공개 페이지, 로그인 불필요)
import styles from '../privacy/privacy.module.css';

export const metadata = {
  title: '계정 및 데이터 삭제 요청 | 커넥티드 모빌리티',
  description: '커넥티드 모빌리티 계정 및 데이터 삭제 요청 방법 안내',
};

export default function AccountDeletionPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>계정 및 데이터 삭제 요청</h1>
      <p className={styles.updated}>운영자: 퍼스트씨앤디 · 앱: 커넥티드 모빌리티</p>

      <div className={styles.intro}>
        퍼스트씨앤디는 <strong>커넥티드 모빌리티</strong> 앱 이용자의 계정 및 개인정보 삭제 요청을 처리합니다. 아래 절차에
        따라 계정 삭제 또는 데이터 삭제를 요청하실 수 있습니다.
      </div>

      <section className={styles.section}>
        <h2 className={styles.h2}>1. 삭제 요청 방법</h2>
        <p className={styles.p}>아래 연락처로 본인(또는 법정대리인) 확인 후 계정·데이터 삭제를 요청하실 수 있습니다.</p>
        <ul className={styles.ul}>
          <li>개인정보 보호책임자: 송경석</li>
          <li>전화: 031-8077-9390</li>
          <li>요청 시 안내: 가입에 사용한 식별 정보(기기 일련번호 또는 카카오 계정)를 알려주시면 본인 확인 후 처리합니다.</li>
        </ul>
        <p className={styles.p}>
          요청이 접수되면 본인 확인 절차를 거쳐 <strong>지체 없이(영업일 기준 14일 이내)</strong> 처리하며, 처리 결과를
          안내해 드립니다.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>2. 삭제되는 데이터</h2>
        <p className={styles.p}>계정 삭제 요청 시 다음 데이터가 삭제됩니다.</p>
        <ul className={styles.ul}>
          <li>계정·인증 정보(카카오 계정 식별자, 기기 로그인 식별자, 역할·승인 상태)</li>
          <li>위치 정보(휠체어 GPS 좌표 및 이동 경로 이력)</li>
          <li>건강·이용 데이터(자세·자세 유지 시간, 욕창 예방·안전 이벤트, 주행·배터리 기록, 입력한 의료 정보)</li>
          <li>푸시 알림 토큰 및 기기 정보</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>3. 보관되는 데이터 및 보관 기간</h2>
        <p className={styles.p}>
          관련 법령에 따라 보존 의무가 있는 정보는 삭제 요청과 별개로 해당 기간 동안 보관된 후 파기됩니다.
        </p>
        <ul className={styles.ul}>
          <li>접속 기록(IP 등): 「통신비밀보호법」에 따라 3개월</li>
          <li>계약 또는 청약철회 등에 관한 기록: 「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 5년</li>
          <li>소비자 불만 또는 분쟁 처리에 관한 기록: 관련 법령에 따라 3년</li>
        </ul>
        <p className={styles.p}>위 법정 보관 기간이 지난 정보는 지체 없이 파기합니다.</p>
      </section>

      <div className={styles.footer}>
        © 퍼스트씨앤디 · 커넥티드 모빌리티 · 개인정보 처리방침:{' '}
        <a href="/privacy">/privacy</a>
      </div>
    </main>
  );
}
