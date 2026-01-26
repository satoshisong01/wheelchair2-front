import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    // 키가 없으면 에러 대신 더미 데이터 반환 (개발 편의성)
    console.error('API Key not found in env');
    return NextResponse.json({
      temp: 18,
      humidity: 45,
      pressure: 1013,
      weather: 'Clouds',
      description: 'API 키 미설정',
      city: 'Test City',
    });
  }

  // 좌표가 없으면 기본값 (서울 시청)
  const targetLat = lat || '37.5665';
  const targetLon = lon || '126.9780';

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${targetLat}&lon=${targetLon}&appid=${apiKey}&units=metric&lang=kr`,
    );

    if (!res.ok) throw new Error('Weather API Failed');

    const data = await res.json();

    return NextResponse.json({
      temp: Math.round(data.main.temp), // 반올림
      humidity: data.main.humidity,
      pressure: data.main.pressure, // ⭐️ 기압 추가 (UI 표시용)
      weather: data.weather[0].main, // Clear, Rain, Clouds...
      description: data.weather[0].description, // '구름 많음' 등 한글
      city: data.name,
    });
  } catch (error) {
    console.error('Weather Fetch Error:', error);
    // 에러 발생 시 더미 데이터 반환
    return NextResponse.json({
      temp: 20,
      humidity: 50,
      pressure: 1015,
      weather: 'Clear',
      description: '정보 없음',
      city: 'Unknown',
    });
  }
}
