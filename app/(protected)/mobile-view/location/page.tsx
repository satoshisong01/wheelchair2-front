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

  // 2. 지도 초기화 함수
  const initializeMap = () => {
    // window.kakao가 없으면 중단
    if (!window.kakao || !mapContainerRef.current) return;

    window.kakao.maps.load(() => {
      const location = new window.kakao.maps.LatLng(lat, lng);
      
      const options = {
        center: location,
        level: 4, 
      };

      const map = new window.kakao.maps.Map(mapContainerRef.current, options);
      mapRef.current = map;

      // ✅ [수정 1] title 속성 필수 추가 (기존 타입 준수)
      const marker = new window.kakao.maps.Marker({
        position: location,
        map: map,
        title: '내 휠체어 위치' 
      });
      markerRef.current = marker;

      // ✅ [수정 2] services 타입 에러 회피 (as any 사용)
      // 기존 타입에는 services가 없으므로 any로 캐스팅해서 접근
      const kakaoMaps = window.kakao.maps as any;

      if (kakaoMaps.services) {
        const geocoder = new kakaoMaps.services.Geocoder();
        const callback = function(result: any, status: any) {
          if (status === kakaoMaps.services.Status.OK) {
             setAddress(result[0].address.address_name);
          } else {
             setAddress(`위도: ${lat.toFixed(4)}, 경도: ${lng.toFixed(4)}`);
          }
        };
        geocoder.coord2Address(lng, lat, callback);
      } else {
        // 라이브러리 로드 실패 시 좌표만 표시
        setAddress(`위도: ${lat.toFixed(4)}, 경도: ${lng.toFixed(4)}`);
      }
    });
  };

  // 3. 스크립트 로드 완료 시 초기화
  useEffect(() => {
    if (isScriptLoaded) {
      initializeMap();
    }
  }, [isScriptLoaded]);

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
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY}&autoload=false&libraries=services`}
        onLoad={() => setIsScriptLoaded(true)}
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
        {!isScriptLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            지도 로딩 중...
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