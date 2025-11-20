// app/api/medical-info/route.ts (any 타입 제거 및 리팩토링 완료)

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

// 1. 인증(authOptions)과 DB 연결 로직
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { AppDataSource, connectDatabase } from '@/lib/db'; // [수정 1] getEntityClass 제거

// 2. 암/복호화 헬퍼 함수 import (동일)
import { encryptMedicalInfo, decryptMedicalInfo } from '@/lib/crypto';

// 3. [수정 2] 엔티티를 상단에서 직접 import
import { MedicalInfo } from '@/entities/MedicalInfo';
import { Repository } from 'typeorm';

// 4. [수정 3] 헬퍼 함수 (initializeApi, dbInitialized, let User: any...) 모두 삭제

/**
 * [GET] 현재 로그인한 사용자의 의료 정보를 *복호화*하여 반환
 */
export async function GET(request: Request) {
  try {
    // --- 1. 사용자 인증 ---
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // --- 2. DB 연결 ---
    await connectDatabase(); // [수정 4] initializeApi() 대신 직접 호출

    // --- 3. [수정 5] Repository 타입을 명시하고, 엔티티 클래스를 직접 사용
    const medicalRepo: Repository<MedicalInfo> =
      AppDataSource.getRepository(MedicalInfo);

    // --- 4. DB에서 내 의료 정보 조회
    const medicalInfo: MedicalInfo | null = await medicalRepo.findOne({
      where: { userId: userId },
    });

    if (!medicalInfo) {
      return NextResponse.json(null);
    }

    // --- 5. [‼️ 핵심 ‼️] DB에서 가져온 데이터를 *복호화*
    const decryptedData = decryptMedicalInfo(medicalInfo);

    // --- 6. 복호화된 데이터를 클라이언트에 반환
    return NextResponse.json(decryptedData);
  } catch (error: unknown) {
    // [‼️‼️ 핵심 수정 ‼️‼️] 'any' -> 'unknown'
    let errorMessage = 'Internal Server Error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error(
      '[API /medical-info] GET 요청 처리 실패:',
      errorMessage,
      error
    );
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

/**
 * [POST] 현재 로그인한 사용자의 의료 정보를 *암호화*하여 저장/업데이트
 * (참고: 이 POST는 'welcome' 페이지의 /api/profile이 대신 처리하게 됩니다.
 * 하지만 나중에 사용자가 프로필 '수정' 페이지에서 의료 정보만 따로 바꿀 때
 * 이 API를 사용할 수 있으므로, 로직을 수정하여 남겨둡니다.)
 */
export async function POST(request: Request) {
  try {
    // --- 1. 사용자 인증 ---
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // --- 2. 요청 바디(body) 파싱 ---
    const body = await request.json();
    const { disabilityGrade, medicalConditions } = body;

    // [수정 6] 'welcome' 페이지의 유효성 검사와 동일하게 변경
    if (!disabilityGrade || !medicalConditions) {
      return NextResponse.json(
        { error: '장애 등급과 특이사항은 필수입니다. "없음"을 입력해주세요.' },
        { status: 400 }
      );
    }

    // --- 3. [‼️ 핵심 ‼️] 데이터 암호화
    const encryptedData = encryptMedicalInfo({
      disabilityGrade: disabilityGrade,
      medicalConditions: medicalConditions,
    });

    // --- 4. DB 연결 ---
    await connectDatabase(); // [수정 7] initializeApi() 대신 직접 호출
    const medicalRepo: Repository<MedicalInfo> =
      AppDataSource.getRepository(MedicalInfo);

    // --- 5. DB에 암호화된 데이터 저장 (Upsert)
    await medicalRepo.save({
      userId: userId, // PK
      ...encryptedData, // 암호화된 데이터
      updatedAt: new Date(),
    });

    // --- 6. 성공 응답 ---
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    // [‼️‼️ 핵심 수정 ‼️‼️] 'any' -> 'unknown'
    let errorMessage = 'Internal Server Error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error(
      '[API /medical-info] POST 요청 처리 실패:',
      errorMessage,
      error
    );
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
