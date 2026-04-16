'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { useMyWheelchair } from '../../../hooks/useMyWheelchair';
import { ChevronLeft, MapPin, Navigation, Locate, RefreshCw } from 'lucide-react';

export default function LocationPage() {
  const router = useRouter();
  const { data: wheelchairData, loading } = useMyWheelchair();
  const status = wheelchairData?.status || {};

  // 1. 위치 데이터 — 실제 데이터가 없으면 null
  const hasRealLocation = !!(status.latitude && status.longitude);
  const lat = hasRealLocation ? Number(status.latitude) : 37.566826;
  const lng = hasRealLocation ? Number(status.longitude) : 126.9786567;
  const distanceM = status.distance ? Number(status.distance).toFixed(1) : '0.0';
  const totalDistanceRaw = status.total_distance ? Number(status.total_distance) : 0;
  const totalDistanceKm = totalDistanceRaw >= 1000
    ? `${(totalDistanceRaw / 1000).toFixed(1)} km`
    : `${totalDistanceRaw.toFixed(1)} m`;

  // 주소 상태
  const [address, setAddress] = useState('위치 정보 수신 중...');

  // 지도 객체 관리
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // 스크립트 로드 상태
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [scriptReloadKey, setScriptReloadKey] = useState(0);
  const [mapRetryCount, setMapRetryCount] = useState(0);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 데이터 로드 완료 여부 추적
  const dataLoadedRef = useRef(false);

  const retryMapLoad = useCallback(() => {
    mapRef.current = null;
    markerRef.current = null;
    setIsMapReady(false);
    setIsScriptLoaded(false);
    setMapRetryCount((prev) => prev + 1);
    setScriptReloadKey((prev) => prev + 1);
  }, []);

  // 지도 전체 새로고침 (모바일 흰화면 대응)
  const handleRefreshMap = useCallback(() => {
    setIsRefreshing(true);

    mapRef.current = null;
    markerRef.current = null;
    dataLoadedRef.current = false;
    setIsMapReady(false);
    setMapRetryCount(0);

    // kakao SDK가 이미 로드되어 있으면 스크립트 재로드 없이 바로 지도 재생성
    if (window.kakao?.maps) {
      setIsScriptLoaded(true);
      // 상태 업데이트 후 다음 렌더에서 initializeMap이 호출되도록 key만 변경
      setScriptReloadKey((prev) => prev + 1);
    } else {
      setIsScriptLoaded(false);
      setScriptReloadKey((prev) => prev + 1);
    }

    setTimeout(() => setIsRefreshing(false), 1000);
  }, []);

  // 2. 지도 초기화 함수
  const initializeMap = useCallback((currentLat: number, currentLng: number) => {
    if (!mapContainerRef.current) return;
    if (!window.kakao?.maps) return;

    const createMap = () => {
      if (mapRef.current) return;
      if (!mapContainerRef.current) return;

      const location = new window.kakao.maps.LatLng(currentLat, currentLng);

      const options = {
        center: location,
        level: 4,
      };

      const map = new window.kakao.maps.Map(mapContainerRef.current, options);
      mapRef.current = map;
      setIsMapReady(true);

      const marker = new window.kakao.maps.Marker({
        position: location,
        map: map,
        title: '내 휠체어 위치'
      });
      markerRef.current = marker;

      const kakaoMaps = window.kakao.maps as any;

      if (kakaoMaps.services) {
        const geocoder = new kakaoMaps.services.Geocoder();
        const callback = function(result: any, geocodeStatus: any) {
          if (geocodeStatus === kakaoMaps.services.Status.OK) {
             setAddress(result[0].address.address_name);
          } else {
             setAddress(`위도: ${currentLat.toFixed(4)}, 경도: ${currentLng.toFixed(4)}`);
          }
        };
        geocoder.coord2Address(currentLng, currentLat, callback);
      } else {
        setAddress(`위도: ${currentLat.toFixed(4)}, 경도: ${currentLng.toFixed(4)}`);
      }
    };

    // kakao.maps.LatLng가 이미 사용 가능하면 load 콜백 없이 바로 실행
    try {
      if (window.kakao.maps.LatLng) {
        createMap();
        return;
      }
    } catch (_) {
      // LatLng 접근 불가 → 아직 로드 안 됨
    }
    window.kakao.maps.load(createMap);
  }, []);

  // 3. 스크립트 로드 완료 + 데이터 준비 시 초기화
  useEffect(() => {
    if (!isScriptLoaded) return;
    if (loading) return; // 데이터 로딩 중이면 대기

    setIsMapReady(false);
    initializeMap(lat, lng);

    const fallback = setTimeout(() => {
      if (!mapRef.current && window.kakao?.maps) {
        initializeMap(lat, lng);
      }
    }, 1000);

    return () => clearTimeout(fallback);
  }, [isScriptLoaded, scriptReloadKey, loading, initializeMap, lat, lng]);

  // 3-1. 데이터가 뒤늦게 도착했을 때 지도 재초기화
  useEffect(() => {
    if (!hasRealLocation || !isMapReady || dataLoadedRef.current) return;

    dataLoadedRef.current = true;

    if (mapRef.current && markerRef.current && window.kakao) {
      const newPos = new window.kakao.maps.LatLng(lat, lng);
      markerRef.current.setPosition(newPos);
      mapRef.current.panTo(newPos);

      const kakaoMaps = window.kakao.maps as any;
      if (kakaoMaps.services) {
        const geocoder = new kakaoMaps.services.Geocoder();
        geocoder.coord2Address(lng, lat, (result: any, geocodeStatus: any) => {
          if (geocodeStatus === kakaoMaps.services.Status.OK) {
            setAddress(result[0].address.address_name);
          }
        });
      }
    }
  }, [hasRealLocation, isMapReady, lat, lng]);

  // 지도 로딩 실패 자동 감지 → 자동 새로고침 (최대 5회, 이후 수동 안내)
  useEffect(() => {
    if (isMapReady) return; // 지도 정상 → 할 일 없음
    if (loading) return;    // 데이터 로딩 중 → 아직 판단 불가

    const timer = setTimeout(() => {
      if (mapRef.current) return; // 이미 성공

      if (mapRetryCount < 5) {
        console.log(`🔄 지도 자동 새로고침 시도 (${mapRetryCount + 1}/5)`);
        // handleRefreshMap과 동일한 로직
        mapRef.current = null;
        markerRef.current = null;
        dataLoadedRef.current = false;
        setIsMapReady(false);
        setMapRetryCount((prev) => prev + 1);

        if (window.kakao?.maps) {
          setIsScriptLoaded(true);
        } else {
          setIsScriptLoaded(false);
        }
        setScriptReloadKey((prev) => prev + 1);
      } else {
        setAddress('지도 로딩에 실패했습니다. 새로고침 버튼을 눌러주세요.');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [isMapReady, loading, mapRetryCount]);

  // 4. 실시간 위치 업데이트
  useEffect(() => {
    if (mapRef.current && markerRef.current && window.kakao) {
      const newPos = new window.kakao.maps.LatLng(lat, lng);

      markerRef.current.setPosition(newPos);
      mapRef.current.panTo(newPos);

      const kakaoMaps = window.kakao.maps as any;
      if (kakaoMaps.services) {
        const geocoder = new kakaoMaps.services.Geocoder();
        geocoder.coord2Address(lng, lat, (result: any, geocodeStatus: any) => {
           if (geocodeStatus === kakaoMaps.services.Status.OK) {
              setAddress(result[0].address.address_name);
           }
        });
      }
    }
  }, [lat, lng]);

  return (
    <div className="min-h-screen bg-white flex flex-col relative">

      {/* 1. 카카오맵 스크립트 로드 */}
      <Script
        key={scriptReloadKey}
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY}&autoload=false&libraries=services`}
        onLoad={() => setIsScriptLoaded(true)}
        onError={() => {
          if (mapRetryCount < 2) retryMapLoad();
          else setAddress('지도 스크립트 로드에 실패했습니다. 새로고침 버튼을 눌러주세요.');
        }}
        strategy="afterInteractive"
      />

      {/* 2. 상단 헤더 */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-start">
        <button
          onClick={() => router.back()}
          className="bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-md text-gray-700 active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-9 h-9" />
        </button>

        {/* 지도 새로고침 버튼 (모바일) */}
        <button
          onClick={handleRefreshMap}
          disabled={isRefreshing}
          className="bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-md text-gray-700 active:scale-95 transition-transform disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 3. 지도 영역 */}
      <div ref={mapContainerRef} className="w-full h-[65vh] bg-gray-100 relative">
        {(!isScriptLoaded || !isMapReady || loading) && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            {loading ? '휠체어 위치 불러오는 중...' : '지도 로딩 중...'}
          </div>
        )}
        {isScriptLoaded && !isMapReady && mapRetryCount >= 2 && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center">
            <button
              type="button"
              onClick={handleRefreshMap}
              className="px-4 py-2 rounded-full bg-white/95 text-sm text-indigo-600 border border-indigo-200 shadow-sm active:scale-95"
            >
              지도 다시 불러오기
            </button>
          </div>
        )}
      </div>

      {/* 4. 하단 정보 시트 */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-6 z-10 p-6 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] flex flex-col">

        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6"></div>

        <div className="flex items-start space-x-4 mb-8">
          <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
            <MapPin className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-500 mb-1">현재 위치</h2>
            <p className="text-lg font-bold text-gray-900 leading-snug break-keep">
              {address}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {hasRealLocation ? '실시간 GPS 수신 중' : '위치 데이터 대기 중...'}
            </p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="text-gray-500 text-sm font-medium mb-1 flex items-center">
              <Navigation className="w-4 h-4 mr-1" />
              오늘 이동 거리
            </h3>
            <div className="text-3xl font-bold text-gray-900">
              {distanceM} <span className="text-lg font-normal text-gray-500">m</span>
            </div>
          </div>

          <button
            onClick={() => {
               if(mapRef.current && window.kakao) {
                 const loc = new window.kakao.maps.LatLng(lat, lng);
                 mapRef.current.panTo(loc);
               }
            }}
            className="w-12 h-12 bg-white rounded-full shadow-sm border flex items-center justify-center text-indigo-600 active:bg-indigo-50"
          >
            <Locate className="w-6 h-6" />
          </button>
        </div>

        <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-100 mt-3">
          <h3 className="text-indigo-500 text-sm font-medium mb-1 flex items-center">
            <Navigation className="w-4 h-4 mr-1" />
            총 이동 거리
          </h3>
          <div className="text-2xl font-bold text-indigo-900">
            {totalDistanceKm}
          </div>
        </div>

      </div>
    </div>
  );
}
