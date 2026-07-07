// app/privacy/page.tsx — 개인정보 처리방침 (Play Store 제출용 공개 페이지, 로그인 불필요)
import styles from './privacy.module.css';

export const metadata = {
  title: '개인정보 처리방침 | 커넥티드 모빌리티',
  description: '커넥티드 모빌리티 서비스의 개인정보 처리방침',
};

export default function PrivacyPolicyPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>개인정보 처리방침</h1>
      <p className={styles.updated}>시행일: 2026년 6월 29일 · 최종 개정일: 2026년 6월 29일</p>

      <div className={styles.intro}>
        퍼스트씨앤디(이하 &lsquo;회사&rsquo;)는 「개인정보 보호법」, 「위치정보의 보호 및 이용 등에 관한 법률」 등
        관련 법령을 준수하며, 이용자의 개인정보를 보호하기 위해 다음과 같이 개인정보 처리방침을 수립·공개합니다.
        본 방침은 회사가 제공하는 <strong>커넥티드 모빌리티</strong> 모바일 애플리케이션 및 웹 서비스(이하
        &lsquo;서비스&rsquo;)에 적용됩니다.
      </div>

      <section className={styles.section}>
        <h2 className={styles.h2}>제1조 (수집하는 개인정보 항목)</h2>
        <p className={styles.p}>회사는 서비스 제공을 위해 다음의 개인정보를 수집합니다.</p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>구분</th>
              <th>수집 항목</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>계정·인증</td>
              <td>카카오 계정 식별자 및 프로필(이름, 이메일 등 카카오 로그인 동의 범위), 기기 로그인 식별자(기기
                일련번호), 비밀번호(암호화 저장), 사용자 역할·승인 상태</td>
            </tr>
            <tr>
              <td>위치정보</td>
              <td>휠체어(기기)의 GPS 위치 좌표 및 이동 경로 이력</td>
            </tr>
            <tr>
              <td>건강·이용 데이터</td>
              <td>자세 각도·자세 유지 시간, 욕창 예방 관련 데이터, 낙상·전복·급경사 등 안전 이벤트, 주행 거리·속도·
                배터리 상태</td>
            </tr>
            <tr>
              <td>기기·푸시</td>
              <td>푸시 알림 토큰(FCM), 기기 모델·운영체제·앱 버전</td>
            </tr>
            <tr>
              <td>자동 수집</td>
              <td>접속 일시·접속 기록, IP 주소, 서비스 이용·조작 기록(감사 로그)</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>제2조 (개인정보의 수집·이용 목적)</h2>
        <ul className={styles.ul}>
          <li>회원 식별 및 인증, 서비스 접근 권한 관리</li>
          <li>휠체어 상태 실시간 모니터링 및 위치 기반 서비스 제공</li>
          <li>낙상·전복·욕창 예방 등 안전 알림(푸시) 발송</li>
          <li>서비스 품질 개선을 위한 통계·분석(비식별 처리)</li>
          <li>고객 문의 대응 및 분쟁 처리</li>
          <li>관련 법령상 의무 이행 및 부정 이용 방지</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>제3조 (개인정보의 보유 및 이용 기간)</h2>
        <p className={styles.p}>
          회사는 원칙적으로 개인정보의 수집·이용 목적이 달성되거나 회원이 탈퇴한 경우 지체 없이 해당 정보를
          파기합니다. 다만 관련 법령에 따라 보존할 필요가 있는 경우 해당 기간 동안 보관합니다.
        </p>
        <ul className={styles.ul}>
          <li>회원 정보: 회원 탈퇴 시까지</li>
          <li>접속 기록(IP 등): 「통신비밀보호법」에 따라 3개월</li>
          <li>계약 또는 청약철회 등에 관한 기록: 「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 5년</li>
          <li>소비자의 불만 또는 분쟁 처리에 관한 기록: 관련 법령에 따라 3년</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>제4조 (처리위탁 및 제3자 제공)</h2>
        <p className={styles.p}>
          회사는 서비스 제공을 위해 아래와 같이 개인정보 처리 업무를 위탁하고 있으며, 위탁계약 시 개인정보가 안전하게
          관리되도록 필요한 사항을 규정하고 있습니다.
        </p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>수탁업체</th>
              <th>위탁 업무</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Amazon Web Services (AWS)</td>
              <td>클라우드 인프라 및 데이터 저장·처리 (서울 리전, ap-northeast-2)</td>
            </tr>
            <tr>
              <td>Google (Firebase)</td>
              <td>푸시 알림(FCM) 발송</td>
            </tr>
            <tr>
              <td>Google (Generative AI)</td>
              <td>이용 데이터 자연어 분석(센서 데이터 기반, 개인 식별정보 제외)</td>
            </tr>
            <tr>
              <td>Kakao</td>
              <td>소셜 로그인 인증, 지도 표시</td>
            </tr>
            <tr>
              <td>OpenWeather</td>
              <td>위치 기반 날씨 정보 제공(좌표 전송)</td>
            </tr>
            <tr>
              <td>Upstash</td>
              <td>로그인 보안(접속 속도 제한)을 위한 일시적 처리</td>
            </tr>
            <tr>
              <td>Vercel</td>
              <td>웹 서비스 호스팅</td>
            </tr>
          </tbody>
        </table>
        <p className={styles.p}>
          회사는 이용자의 개인정보를 본 방침에서 명시한 범위를 초과하여 제3자에게 제공하지 않습니다. 다만 이용자가
          사전에 동의한 경우 또는 법령에 따라 요구되는 경우에는 예외로 합니다. 일부 수탁업체는 서비스 특성상 국외에
          소재할 수 있으며, 이 경우에도 관련 법령에 따라 안전하게 처리되도록 관리합니다.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>제5조 (위치정보의 처리)</h2>
        <p className={styles.p}>
          회사는 휠체어의 안전 모니터링 및 위치 기반 서비스 제공을 위해 기기의 위치정보를 수집·이용합니다. 위치정보는
          서비스 제공 목적 범위 내에서만 이용되며, 이용자(또는 보호자)는 위치정보 수집에 대한 동의를 언제든지 철회할 수
          있습니다. 회사는 「위치정보의 보호 및 이용 등에 관한 법률」에 따라 위치정보를 관리합니다.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>제6조 (민감정보의 처리)</h2>
        <p className={styles.p}>
          회사는 건강 관련 정보 등 민감정보를 이용자의 별도 동의를 받은 경우에 한하여 최소한의 범위에서 수집하며,
          저장 시 암호화 등 안전성 확보 조치를 적용합니다.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>제7조 (이용자 및 법정대리인의 권리와 행사 방법)</h2>
        <p className={styles.p}>
          이용자는 언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수 있으며, 개인정보 수집·이용에
          대한 동의를 철회할 수 있습니다. 권리 행사는 아래 개인정보 보호책임자에게 서면·전화 등으로 요청할 수
          있으며, 회사는 지체 없이 조치합니다.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>제8조 (만 14세 미만 아동의 개인정보)</h2>
        <p className={styles.p}>
          회사는 만 14세 미만 아동의 개인정보를 수집할 경우 법정대리인의 동의를 받으며, 법정대리인은 아동의
          개인정보에 대한 열람·정정·삭제·동의 철회를 요청할 수 있습니다.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>제9조 (개인정보의 안전성 확보 조치)</h2>
        <ul className={styles.ul}>
          <li>전송 구간 암호화(TLS) 및 민감정보 저장 시 암호화(AES-256)</li>
          <li>역할 기반 접근통제(RBAC) 및 최소 권한 원칙 적용</li>
          <li>접속 기록 보관 및 위·변조 방지(감사 로그)</li>
          <li>비밀번호 일방향 암호화 저장 및 로그인 실패 횟수 제한</li>
          <li>개인정보 취급 담당자 최소화 및 정기 점검</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>제10조 (개인정보 보호책임자 및 사업자 정보)</h2>
        <p className={styles.p}>
          회사는 개인정보 처리에 관한 업무를 총괄하여 책임지고, 이용자의 불만 처리 및 피해 구제를 위하여 아래와 같이
          개인정보 보호책임자를 지정하고 있습니다.
        </p>
        <ul className={styles.ul}>
          <li>개인정보 보호책임자: 송경석</li>
          <li>연락처: 031-8077-9390</li>
        </ul>
        <p className={styles.p}>
          사업자명: 퍼스트씨앤디 · 대표자: 김종우 · 주소: 경기도 화성시 동탄첨단산업1로 27, B동 1018호
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>제11조 (권익침해 구제 방법)</h2>
        <p className={styles.p}>
          이용자는 개인정보 침해로 인한 구제를 받기 위하여 아래 기관에 분쟁 해결이나 상담을 신청할 수 있습니다.
        </p>
        <ul className={styles.ul}>
          <li>개인정보분쟁조정위원회: (국번없이) 1833-6972 / www.kopico.go.kr</li>
          <li>개인정보침해신고센터: (국번없이) 118 / privacy.kisa.or.kr</li>
          <li>대검찰청 사이버수사과: (국번없이) 1301 / www.spo.go.kr</li>
          <li>경찰청 사이버수사국: (국번없이) 182 / ecrm.police.go.kr</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>제12조 (개인정보 처리방침의 변경)</h2>
        <p className={styles.p}>
          본 개인정보 처리방침은 법령·정책 또는 서비스 변경에 따라 개정될 수 있으며, 변경 시 시행일 및 변경 내용을
          서비스 내 공지(또는 본 페이지)를 통해 안내합니다.
        </p>
      </section>

      <div className={styles.footer}>
        © 퍼스트씨앤디. 커넥티드 모빌리티 서비스 · 본 페이지는 Google Play 등 앱 마켓 제출용 공개 개인정보
        처리방침입니다.
      </div>
    </main>
  );
}
