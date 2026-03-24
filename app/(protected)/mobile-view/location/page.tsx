'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { useMyWheelchair } from '../../../hooks/useMyWheelchair';
import { ChevronLeft, MapPin, Navigation, Locate } from 'lucide-react';

export default function LocationPage() {
  const router = useRouter();
  const { data: wheelchairData } = useMyWheelchair();
  const status = wheelchairData?.status || {};

  // 1. 위치 데이터
  const lat = status.latitude ? Number(status.latitude) : 37.566826;
  const lng = status.longitude ? Number(status.longitude) : 126.9786567;
  const distanceM = status.distance ? Number(status.distance).toFixed(1) : '0.0';

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

  const retryMapLoad = () => {
    mapRef.current = null;
    markerRef.current = null;
    setIsMapReady(false);
    setIsScriptLoaded(false);
    setMapRetryCount((prev) => prev + 1);
    setScriptReloadKey((prev) => prev + 1);
  };

  // 2. 지도 초기화 함수 — lat/lng를 인자로 받아 stale closure 방지
  const initializeMap = (currentLat: number, currentLng: number) => {
    if (!mapContainerRef.current) return;

    // 스크립트 캐시로 window.kakao가 이미 있을 수 있으므로 직접 확인
    if (!window.kakao?.maps) return;

    window.kakao.maps.load(() => {
      // 이미 맵이 초기화됐다면 중복 생성 방지
      if (mapRef.current) return;

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
        const callback = function(result: any, status: any) {
          if (status === kakaoMaps.services.Status.OK) {
             setAddress(result[0].address.address_name);
          } else {
             setAddress(`위도: ${currentLat.toFixed(4)}, 경도: ${currentLng.toFixed(4)}`);
          }
        };
        geocoder.coord2Address(currentLng, currentLat, callback);
      } else {
        setAddress(`위도: ${currentLat.toFixed(4)}, 경도: ${currentLng.toFixed(4)}`);
      }
    });
  };

  // 3. 스크립트 로드 완료 시 초기화
  useEffect(() => {
    if (!isScriptLoaded) return;
    setIsMapReady(false);
    initializeMap(lat, lng);

    // 스크립트 onLoad 후에도 kakao.maps.load 콜백이 지연될 수 있으므로 보험 재시도
    const fallback = setTimeout(() => {
      if (!mapRef.current && window.kakao?.maps) {
        initializeMap(lat, lng);
      }
    }, 1000);

    return () => clearTimeout(fallback);
  }, [isScriptLoaded, scriptReloadKey]);

  useEffect(() => {
    if (!isScriptLoaded || isMapReady) return;

    const timer = setTimeout(() => {
      if (!mapRef.current) {
        if (mapRetryCount < 2) {
          retryMapLoad();
        } else {
          setAddress('지도 로딩이 지연되고 있습니다. 아래 버튼으로 다시 시도해주세요.');
        }
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [isScriptLoaded, isMapReady, mapRetryCount]);

  // 4. 실시간 위치 업데이트
  useEffect(() => {
    if (mapRef.current && markerRef.current && window.kakao) {
      const newPos = new window.kakao.maps.LatLng(lat, lng);
      
      markerRef.current.setPosition(newPos);
      mapRef.current.panTo(newPos);

      // 주소 갱신 (as any 사용)
      const kakaoMaps = window.kakao.maps as any;
      if (kakaoMaps.services) {
        const geocoder = new kakaoMaps.services.Geocoder();
        geocoder.coord2Address(lng, lat, (result: any, status: any) => {
           if (status === kakaoMaps.services.Status.OK) {
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
          else setAddress('지도 스크립트 로드에 실패했습니다. 네트워크를 확인 후 다시 시도해주세요.');
        }}
        strategy="afterInteractive"
      />

      {/* 2. 상단 헤더 */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4">
        <button 
          onClick={() => router.back()} 
          className="bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-md text-gray-700 active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      </div>

      {/* 3. 지도 영역 */}
      <div ref={mapContainerRef} className="w-full h-[65vh] bg-gray-100 relative">
        {(!isScriptLoaded || !isMapReady) && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            지도 로딩 중...
          </div>
        )}
        {isScriptLoaded && !isMapReady && mapRetryCount >= 2 && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center">
            <button
              type="button"
              onClick={retryMapLoad}
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
            <p className="text-xs text-gray-400 mt-1">실시간 GPS 수신 중</p>
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

      </div>
    </div>
  );
}