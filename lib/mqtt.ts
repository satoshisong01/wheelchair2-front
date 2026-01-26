/**
 * MQTT 클라이언트 설정 (브라우저용)
 * TODO: Socket.IO를 통한 실시간 연결 구현 필요
 */

import mqtt from 'mqtt';

// MQTT 브로커 연결 설정
const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtts://localhost:8883';
const mqttUsername = process.env.MQTT_USERNAME;
const mqttPassword = process.env.MQTT_PASSWORD;

/**
 * MQTT 클라이언트 연결
 * 주의: 브라우저에서 직접 MQTT 연결은 제한적이므로,
 * Socket.IO를 통해 서버를 거쳐서 연결하는 것을 권장합니다.
 */
export const connectMQTT = () => {
  const client = mqtt.connect(brokerUrl, {
    username: mqttUsername,
    password: mqttPassword,
    clean: true,
    reconnectPeriod: 1000,
    connectTimeout: 30 * 1000,
  });

  client.on('connect', () => {
    console.log('✅ Connected to Mosquitto broker');
  });

  client.on('error', (error) => {
    console.error('❌ MQTT connection error:', error);
  });

  client.on('reconnect', () => {
    console.log('🔄 Reconnecting to broker...');
  });

  client.on('close', () => {
    console.log('🔌 Disconnected from broker');
  });

  return client;
};

/**
 * 휠체어 데이터 구독
 */
export const subscribeWheelchairData = (
  client: mqtt.MqttClient,
  callback: (data: any) => void
) => {
  // 단기 데이터 구독
  client.subscribe('CWs', (err) => {
    if (err) {
      console.error('❌ Failed to subscribe CWs:', err);
    } else {
      console.log('✅ Subscribed to CWs (단기 데이터)');
    }
  });

  // 장기 데이터 구독
  client.subscribe('CWl', (err) => {
    if (err) {
      console.error('❌ Failed to subscribe CWl:', err);
    } else {
      console.log('✅ Subscribed to CWl (장기 데이터)');
    }
  });

  // 이벤트 구독
  client.subscribe('E_FALL', (err) => {
    if (err) {
      console.error('❌ Failed to subscribe E_FALL:', err);
    } else {
      console.log('✅ Subscribed to E_FALL (낙상 이벤트)');
    }
  });

  client.on('message', (topic, message) => {
    console.log(`📨 Message received on topic ${topic}`);
    const data = parseMQTTMessage(message.toString());
    callback(data);
  });
};

/**
 * MQTT 메시지 파싱
 * 형식: "CTN,0122611455,VOL,12.5,CUR,1.1,SPD,3.0,..."
 */
export const parseMQTTMessage = (message: string) => {
  const parts = message.split(',');
  const data: any = {};

  for (let i = 0; i < parts.length; i += 2) {
    const key = parts[i];
    const value = parts[i + 1];

    if (key && value) {
      // 숫자로 변환 가능한 경우 변환
      data[key] = isNaN(Number(value)) ? value : Number(value);
    }
  }

  return data;
};






