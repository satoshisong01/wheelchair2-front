'use client';

// 1. [수정] useState import 추가
import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { DashboardWheelchair } from '@/types/wheelchair';
import styles from './MapView.module.css';
import { KAKAO_MAP_SDK_URL, useIsClient } from './KakaoMapSdkPreload';

// ... (KakaoMapLatLng, KakaoMapMarker 인터페이스는 동일) ...
interface KakaoMapLatLng {
  getLat(): number;
  getLng(): number;
}
interface KakaoMapMarker {
  setPosition(position: KakaoMapLatLng): void;
  setMap(map: KakaoMapInstance | null): void;
}
// [수정] KakaoMapInstance 인터페이스에 relayout 추가
interface KakaoMapInstance {
  panTo(position: KakaoMapLatLng): void;
  setCenter(position: KakaoMapLatLng): void;
  getCenter(): KakaoMapLatLng;
  relayout(): void;
}
// ... (KakaoMapsSDK, Window 타입 정의는 동일) ...
type KakaoMapsSDK = {
  maps: {
    load(callback: () => void): void;
    Map: new (
      container: HTMLElement,
      options: { center: KakaoMapLatLng; level: number }
    ) => KakaoMapInstance;
    LatLng: new (lat: number, lng: number) => KakaoMapLatLng;
    Marker: new (options: {
      map: KakaoMapInstance;
      position: KakaoMapLatLng;
      title: string;
    }) => KakaoMapMarker;
    event: {
      addListener(
        target: KakaoMapMarker,
        event: string,
        callback: () => void
      ): void;
    };
  };
};
declare global {
  interface Window {
    kakao: KakaoMapsSDK;
  }
}
// ... (Props 인터페이스는 동일) ...
interface MapViewProps {
  wheelchairs: DashboardWheelchair[];
  selectedWheelchair?: DashboardWheelchair | null;
  onSelectWheelchair: (wheelchair: DashboardWheelchair) => void; // 🚨 [FIX] onSelectWheelchair 타입 수정
}

export default function MapView({
  wheelchairs,
  selectedWheelchair,
  onSelectWheelchair,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMapInstance | null>(null); // 🚨 [FIX] markersRef의 Key 타입을 number 대신 string | number로 유연하게 변경
  const markersRef = useRef<{ [key: string | number]: KakaoMapMarker }>({});
  // 최신 휠체어 목록·선택 — 지도 생성 콜백(kakao.maps.load)은 데이터가 오기 전 렌더에서 만들어져 그때의 빈 목록을 붙잡고 있으므로,
  //   마커 갱신·지도 생성은 props 대신 이 ref에서 읽음 (콜백을 기다리는 사이 도착한 데이터를 놓치지 않게)
  const wheelchairsRef = useRef(wheelchairs);
  const selectedWheelchairRef = useRef(selectedWheelchair);
  // props → ref 동기화 — 아래 지도·마커 effect보다 먼저 선언해야 같은 커밋에서 최신 값을 읽음
  useEffect(() => {
    wheelchairsRef.current = wheelchairs;
    selectedWheelchairRef.current = selectedWheelchair;
  }, [wheelchairs, selectedWheelchair]);
  // SDK <Script>는 클라이언트 렌더에서만 그림 (SSR되면 next/script가 SDK preload를 <head>에 실음 — useIsClient 주석 참고)
  const isClient = useIsClient();
  // 지도 상태 문구용 — 자리표시 이미지가 실제(흐린) 지도처럼 보여서, SDK가 늦거나 실패하면 문구로 알림
  const [isMapReady, setIsMapReady] = useState(false); // 지도 생성 완료
  const [mapError, setMapError] = useState(false); // SDK 스크립트 로드 실패
  const [isScriptLoaded, setIsScriptLoaded] = useState(false); // --- 🔽🔽🔽 [수정 1] `updateMarkers`를 `initializeMap`보다 먼저 선언 🔽🔽🔽 ---
  /**
   * [18주차] 휠체어 데이터(실시간)가 변경될 때마다 마커를 업데이트하는 함수
   */

  const updateMarkers = (map: KakaoMapInstance, kakao: KakaoMapsSDK) => {
    const currentMarkers = markersRef.current;
    const currentWheelchairs = wheelchairsRef.current;
    // 목록에서 빠진 휠체어의 마커 제거 — 휠체어정보 페이지는 보는 휠체어가 바뀌어도 MapView가 그대로 남아 이전 휠체어 마커가 남음
    const currentIds = new Set(currentWheelchairs.map((wheelchair) => String(wheelchair.id)));
    Object.keys(currentMarkers).forEach((markerId) => {
      if (currentIds.has(markerId)) return;
      currentMarkers[markerId].setMap(null);
      delete currentMarkers[markerId];
    });
    currentWheelchairs.forEach((wheelchair) => {
      const lat = wheelchair.status?.latitude;
      const lng = wheelchair.status?.longitude;
      if (!lat || !lng) return; // 🚨 [FIX] wheelchair.id를 string으로 변환하여 안전하게 사용
      const wheelchairId = String(wheelchair.id);
      const position = new kakao.maps.LatLng(lat, lng);
      if (currentMarkers[wheelchairId]) {
        currentMarkers[wheelchairId].setPosition(position);
      } else {
        const marker = new kakao.maps.Marker({
          map: map,
          position: position, // 🚨 [핵심 FIX] deviceSerial 대신 device_serial 사용 (타입 캐스팅 추가)
          title:
            wheelchair.nickname || (wheelchair as any).device_serial || 'N/A',
        });
        kakao.maps.event.addListener(marker, 'click', () => {
          // onSelectWheelchair의 인수를 수정했습니다.
          onSelectWheelchair(wheelchair);
          map.panTo(position);
        });
        currentMarkers[wheelchairId] = marker;
      }
    });
  }; // --- 🔼🔼🔼 [수정 1] 🔼🔼🔼 ---
  /**
   * [17주차] 카카오맵 스크립트가 로드되면 지도를 초기화하는 함수
   */
  const initializeMap = () => {
    // 탭 전환 시 window.kakao가 있어도 ref가 null일 수 있으므로 재확인
    if (!window.kakao || !mapContainerRef.current) {
      console.warn('Kakao SDK 또는 맵 컨테이너가 준비되지 않았습니다.');
      return;
    }

    window.kakao.maps.load(() => {
      const kakao = window.kakao;
      const mapContainer = mapContainerRef.current; // 탭 전환 시 mapContainer가 null이 될 수 있으므로 다시 체크

      if (!mapContainer) return;

      const mapOption = {
        center: new kakao.maps.LatLng(37.566826, 126.9786567),
        level: 5,
      };

      const map = new kakao.maps.Map(mapContainer, mapOption);
      setIsMapReady(true);
      // 지도가 데이터보다 늦게 만들어진 경우 — 그 사이 선택 effect는 지도가 없어 이동하지 못했으므로 선택된 휠체어 위치로 맞춤
      const selected = selectedWheelchairRef.current;
      const selectedLat = selected?.status?.latitude;
      const selectedLng = selected?.status?.longitude;
      if (selectedLat && selectedLng) {
        map.setCenter(new kakao.maps.LatLng(selectedLat, selectedLng));
      }
      mapRef.current = map; // 마커 업데이트 (초기 로드) - 이제 이 함수는 위에 선언되어 있습니다.

      updateMarkers(map, kakao); // [회색 지도 버그 수정] 렌더링 딜레이 후 relayout

      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.relayout();
        }
      }, 200);
    });
  }; // --- 🔽🔽🔽 [수정 2] 탭 전환 문제 해결을 위한 useEffect 추가 🔽🔽🔽 --- // 컴포넌트 마운트 시(탭 전환 포함) 항상 실행

  useEffect(() => {
    // 1. <div> ref가 준비되었는지 확인
    if (mapContainerRef.current) {
      // 2. <Script>의 onLoad가 실행되지 않아도 window.kakao가 이미 있는지 확인
      if (window.kakao && window.kakao.maps) {
        // 3. 지도가 아직 안 그려졌다면(mapRef.current === null)
        if (mapRef.current === null) {
          console.log(
            'Kakao SDK가 이미 로드되어 있어 지도를 수동으로 초기화합니다.'
          );
          initializeMap();
        }
      }
    }
  }, []); // 빈 배열: 마운트될 때 1회만 실행 // --- 🔼🔼🔼 [수정 2] 🔼🔼🔼 --- // [수정 3] <Script onLoad>로 인한 첫 로드를 처리하는 useEffect
  useEffect(() => {
    // 1. 스크립트가 로드되었고 (isScriptLoaded)
    // 2. <div>가 렌더링되었는지 (mapContainerRef.current) 확인
    if (!isScriptLoaded || !mapContainerRef.current) {
      return; // 둘 중 하나라도 준비 안 되면 실행 안 함
    } // 지도가 아직 안 만들어졌을 때만 초기화

    if (mapRef.current === null) {
      console.log('onLoad가 실행되어 지도를 초기화합니다.');
      initializeMap();
    } // 4. [중요] 컴포넌트 언마운트 시(탭 이동 시) Ref 초기화

    return () => {
      mapRef.current = null;
    };
  }, [isScriptLoaded, mapContainerRef]); // 스크립트 또는 div가 준비되면 이 훅 실행

  // 컨테이너 크기가 바뀌면 지도를 다시 배치(중심 유지) — 지도가 데이터보다 먼저 만들어지므로(첫 화면 LCP 개선)
  //   이후 화면 틀이 채워지거나 창 크기가 바뀌면 지도 생성 때와 크기가 달라질 수 있음
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    let lastWidth = 0;
    let lastHeight = 0;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // 1px 미만 변화(로딩 자리 → 실제 요소 교체 시 소수점 차이 등)는 무시 — 불필요한 setCenter로 진행 중인 panTo가 끊기지 않게
      if (Math.abs(width - lastWidth) < 1 && Math.abs(height - lastHeight) < 1) return;
      lastWidth = width;
      lastHeight = height;

      const map = mapRef.current;
      if (!map) return;
      const center = map.getCenter();
      map.relayout();
      map.setCenter(center);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  /**
   * [useEffect] 휠체어 목록(props)이 변경될 때마다 마커 업데이트 함수 호출
   */

  useEffect(() => {
    if (!mapRef.current || !window.kakao) return;
    updateMarkers(mapRef.current, window.kakao);
  }, [wheelchairs, onSelectWheelchair]); // --- 🔽🔽🔽 [신규 추가] 휠체어 선택 시 지도로 이동 (Problem 1) 🔽🔽🔽 ---

  useEffect(() => {
    // 1. 맵이 준비되고, 휠체어가 선택되었는지 확인
    if (mapRef.current && selectedWheelchair && window.kakao) {
      const lat = selectedWheelchair.status?.latitude;
      const lng = selectedWheelchair.status?.longitude; // 2. 선택된 휠체어의 좌표가 있는지 확인

      if (lat && lng) {
        const position = new window.kakao.maps.LatLng(lat, lng); // 3. 지도를 해당 좌표로 부드럽게 이동
        mapRef.current.panTo(position);
      }
    }
  }, [selectedWheelchair]); // selectedWheelchair prop이 변경될 때마다 실행 // --- 🔼🔼🔼 [신규 추가] 🔼🔼🔼 --- // --- [수정] 4. JSX 렌더링 ---
  return (
    <div className={styles.container}>
      {isClient && (
        <Script
          src={KAKAO_MAP_SDK_URL} // [수정] onLoad는 이제 state만 true로 변경
          onLoad={() => setIsScriptLoaded(true)}
          onError={(e) => {
            console.error('Kakao 지도 스크립트 로드 실패:', e);
            setMapError(true);
          }}
          strategy="afterInteractive"
        />
      )}
      {/* [수정] id="map" 대신 ref={mapContainerRef} 사용 */}
      {/* 로드 실패 시 자리표시 이미지를 뺌 (실패한 지도가 불러온 것처럼 보이지 않게) — 이 요소의 인라인 style은 카카오가 쓰므로 클래스로 지정 */}
      <div
        ref={mapContainerRef}
        className={mapError ? `${styles.mapContainer} ${styles.mapContainerError}` : styles.mapContainer}
      />
      {/* 지도 상태 문구 — 카카오 컨테이너 안이 아니라 형제 요소로 둠 (컨테이너 내부는 카카오가 그림) */}
      {!isMapReady && (
        <div className={styles.mapStatus}>
          {mapError ? '지도를 불러오지 못했습니다' : '지도 불러오는 중...'}
        </div>
      )}
      <div className={styles.controls}>
        <button className={styles.controlButton}>전체보기</button>
      </div>
    </div>
  );
}
