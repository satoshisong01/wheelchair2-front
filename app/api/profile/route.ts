import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { AppDataSource, connectDatabase } from '@/lib/db';
import { User } from '@/entities/User';
import { MedicalInfo } from '@/entities/MedicalInfo';
import { Wheelchair } from '@/entities/Wheelchair';
import { UserWheelchair } from '@/entities/UserWheelchair';
import { encryptMedicalInfo } from '@/lib/crypto';

export async function POST(request: Request) {
  console.log('--- [DEBUG /api/profile] POST 요청 수신 ---');
  try {
    // 1. 세션 확인
    const session = await getServerSession(authOptions);

    // --- (디버깅 로그는 그대로 둡니다) ---
    if (!session || !session.user || !session.user.id) {
      console.error('[DEBUG /api/profile] 401 Unauthorized 반환.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    console.log(`[DEBUG /api/profile] 세션 ID (${userId}) 확인 완료.`);

    // 2. Body 데이터 파싱
    const body = await request.json();
    const {
      nickname,
      location1, // ‼️ [수정 1] location1 (시/도) 값 받기
      location2, // ‼️ [수정 1] location2 (시/군/구) 값 받기
      deviceSerial,
      modelName,
      purchaseDate,
      disabilityGrade,
      medicalConditions,
    } = body;

    // 3. 필수 값 재확인 (location은 선택 사항으로 가정, 필수가 아님)
    if (!nickname || !deviceSerial || !disabilityGrade || !medicalConditions) {
      return NextResponse.json(
        { error: '필수 입력값이 누락되었습니다.' },
        { status: 400 }
      );
    }

    await connectDatabase();
    const userRepo = AppDataSource.getRepository(User);
    const medicalRepo = AppDataSource.getRepository(MedicalInfo);
    const wheelchairRepo = AppDataSource.getRepository(Wheelchair);
    const mappingRepo = AppDataSource.getRepository(UserWheelchair);

    // --- 4. [트랜잭션] ---
    await AppDataSource.transaction(async (transactionalEntityManager) => {
      // 4-1. User 테이블: 닉네임 및 지역 정보 업데이트
      await transactionalEntityManager.update(User, userId, {
        nickname: nickname,
        location1: location1 || null, // ‼️ [수정 2] location1 저장 (없으면 null)
        location2: location2 || null, // ‼️ [수정 2] location2 저장 (없으면 null)
      });

      // 4-2. MedicalInfo 테이블: 의료 정보 (암호화)
      const encryptedData = encryptMedicalInfo({
        disabilityGrade: disabilityGrade,
        medicalConditions: medicalConditions,
      });
      await transactionalEntityManager.save(MedicalInfo, {
        userId: userId,
        ...encryptedData,
        updatedAt: new Date(),
      });

      // 4-3. 휠체어 검색 또는 생성
      let wheelchair = await transactionalEntityManager.findOne(Wheelchair, {
        where: { deviceSerial: deviceSerial },
      });

      if (!wheelchair) {
        console.log(`[API /profile] 새 휠체어 등록: ${deviceSerial}`);
        wheelchair = transactionalEntityManager.create(Wheelchair, {
          deviceSerial: deviceSerial,
          modelName: modelName || null,
          purchaseDate: purchaseDate || null,
        });
      } else {
        console.log(
          `[API /profile] 기존 휠체어 정보 업데이트: ${deviceSerial}`
        );
        wheelchair.modelName = modelName || wheelchair.modelName;
        wheelchair.purchaseDate = purchaseDate || wheelchair.purchaseDate;
      }

      await transactionalEntityManager.save(Wheelchair, wheelchair);

      // 4-4. UserWheelchair 테이블: 사용자와 휠체어 N:M 연결
      const existingMapping = await transactionalEntityManager.findOne(
        UserWheelchair,
        {
          where: { userId: userId, wheelchairId: wheelchair.id },
        }
      );

      if (!existingMapping) {
        const newMapping = transactionalEntityManager.create(UserWheelchair, {
          userId: userId,
          wheelchairId: wheelchair.id,
          name: `${nickname}의 휠체어`,
        });
        await transactionalEntityManager.save(UserWheelchair, newMapping);
      }
    }); // --- 트랜잭션 종료 ---

    // 5. 성공 응답
    console.log(`[DEBUG /api/profile] 200 OK 반환.`);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error('--- ‼️ [DEBUG /api/profile] POST CATCH ‼️ ---');
    let errorMessage = 'Internal Server Error';
    if (error instanceof Error) {
      if (
        error.message.includes('duplicate key value violates unique constraint')
      ) {
        errorMessage = '이미 등록된 시리얼 번호입니다.';
      } else {
        errorMessage = error.message;
      }
    }
    console.error(errorMessage, error);
    console.error('---------------------------------------------');

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
