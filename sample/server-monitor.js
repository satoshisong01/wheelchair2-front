// 📍 경로: /home/ubuntu/scripts/server-monitor.js

// 🔒 [보안] wheelchair2-front의 .env에서 SERVER_HEALTH_SECRET 로드
require('dotenv').config({ path: '/home/ubuntu/wheelchair2-front/.env' });

const { exec } = require('child_process');
const os = require('os');

// --- 환경 설정 ---
const SERVER_IDENTIFIER = 'ec2-prod-wheelchair-01';
const API_ENDPOINT = 'http://localhost:3000/api/alerts/server-health';
const HEALTH_SECRET = process.env.SERVER_HEALTH_SECRET;

if (!HEALTH_SECRET) {
  console.error('⚠️ SERVER_HEALTH_SECRET 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
}

// --- 임계값 설정 ---
const CPU_THRESHOLD = 90; // 90% 이상 시 감지
const MEM_THRESHOLD_GB = 0.5;
// ⭐️ [수정] 테스트를 위해 10초로 단축 (테스트 후 60000으로 변경 권장)
const CHECK_INTERVAL_MS = 10000;
const INITIAL_DELAY_MS = 30000;

// 시스템 명령어 실행 함수
const runCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        reject(error);
        return;
      }
      if (stderr) {
        resolve(stdout);
        return;
      }
      resolve(stdout);
    });
  });
};

// --- 상태 체크 로직 ---
async function checkServerHealth() {
  let cpuPercent = 0;
  let memFreeGB = 0;
  let alertReason = null;
  let psOutput = '';
  let isSafeBuild = false;

  try {
    // 1. CPU 및 프로세스 분석
    psOutput = await runCommand(
      'ps -eo pid,pcpu,pmem,comm,args --sort=-pcpu | head -n 6',
    );
    const lines = psOutput.trim().split('\n');

    if (lines.length > 1) {
      const topProcess = lines[1].trim().split(/\s+/);
      const currentCpuUsage = parseFloat(topProcess[1]);

      cpuPercent = currentCpuUsage;

      // 빌드 키워드 검사
      const commandStr = topProcess.slice(4).join(' ');
      const ignoreKeywords = ['ps', 'head'];
      if (ignoreKeywords.some((keyword) => commandStr.includes(keyword))) {
        // console.log('모니터링 자체 프로세스 무시됨'); // 테스트할 때만 주석 해제
        return;
      }
      const safeKeywords = [
        'next',
        'build',
        'webpack',
        'tsc',
        'typescript',
        'node_modules',
        'npm',
        'yarn',
        'ts-node',
        'node',
        'client',
        'server.js',
        'ps',
        'head',
      ];

      if (safeKeywords.some((keyword) => commandStr.includes(keyword))) {
        isSafeBuild = true;
      }
    }

    // 2. 메모리 체크
    const freeMemBytes = os.freemem();
    memFreeGB = parseFloat((freeMemBytes / 1024 / 1024 / 1024).toFixed(2));

    const culpritProcess =
      lines.length > 1
        ? lines[1].trim().split(/\s+/).slice(4).join(' ').substring(0, 20)
        : 'unknown';

    // 3. 상황별 메시지 분류 (사용자 요청 반영)
    if (cpuPercent >= CPU_THRESHOLD) {
      if (isSafeBuild) {
        // 🟢 [수정] 요청하신 문구로 변경
        alertReason = `🔄 서버 작업 중 [${culpritProcess}] (CPU: ${cpuPercent}%)`;
      } else {
        alertReason = `🚨 서버 이상 과부하 [범인: ${culpritProcess}] (CPU: ${cpuPercent}%)`;
      }
    } else if (memFreeGB <= MEM_THRESHOLD_GB) {
      alertReason = `가용 메모리 부족 (${memFreeGB} GB)`;
    }

    // 4. 알림 전송
    if (alertReason) {
      console.warn(`${alertReason} - Sending log...`);

      const payload = {
        cpu_percent: cpuPercent,
        memory_free_gb: memFreeGB,
        alert_reason: alertReason,
        server_id: SERVER_IDENTIFIER,
        process_info: psOutput,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

      try {
        const response = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-health-secret': HEALTH_SECRET || '',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          console.log(`✅ Log saved: ${alertReason}`);
        } else {
          // 서버가 빌드 중이라 응답 못할 때가 많음 -> 로그로 확인
          console.error(
            `❌ Server busy (Build in progress?): ${response.status}`,
          );
        }
      } catch (e) {
        // 빌드 중엔 연결 거부(Connection Refused)가 뜰 수 있음
        console.error(`⚠️ Log skipped (Server restarting...): ${e.message}`);
      }
    }
  } catch (error) {
    console.error('Check Error:', error);
  }
}

console.log(`[START] Monitor started. Interval: ${CHECK_INTERVAL_MS / 1000}s`);

setTimeout(() => {
  setInterval(checkServerHealth, CHECK_INTERVAL_MS);
  checkServerHealth();
}, INITIAL_DELAY_MS);
