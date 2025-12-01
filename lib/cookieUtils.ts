export const clearAllCookies = () => {
  // 1. 현재 도메인의 모든 쿠키를 가져옵니다.
  const cookies = document.cookie.split(';');

  // 2. 과거 시간으로 만료일을 설정하여 모든 쿠키를 무효화합니다.
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i];
    const eqPos = cookie.indexOf('=');
    const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;

    // 기본 도메인 및 상위 도메인까지 시도하며 삭제
    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    document.cookie =
      name +
      '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' +
      window.location.hostname;

    // next-auth가 사용하는 특정 쿠키 이름들을 명시적으로 삭제
    if (
      name.trim() === 'next-auth.session-token' ||
      name.trim() === '__Secure-next-auth.session-token'
    ) {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;`;
    }
  }
};
