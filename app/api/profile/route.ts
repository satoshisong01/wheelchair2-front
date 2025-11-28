import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { AppDataSource, connectDatabase } from '@/lib/db';
import { User } from '@/entities/User';
import { MedicalInfo } from '@/entities/MedicalInfo';
import { Wheelchair } from '@/entities/Wheelchair';
// ❌ [삭제] 삭제된 엔티티 Import 제거
// import { UserWheelchair } from '@/entities/UserWheelchair';
import { encryptMedicalInfo } from '@/lib/crypto';

export async function POST(request: Request) {
  console.log('--- [DEBUG /api/profile] POST 요청 수신 ---');
  try {
    // 1. 세션 확인
    const session = await getServerSession(authOptions);

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
      location1, // 시/도
      location2, // 시/군/구
      deviceSerial,
      modelName,
      purchaseDate,
      disabilityGrade,
      medicalConditions,
    } = body;

    // 3. 필수 값 재확인
    if (!nickname || !deviceSerial || !disabilityGrade || !medicalConditions) {
      return NextResponse.json(
        { error: '필수 입력값이 누락되었습니다.' },
        { status: 400 }
      );
    }

    await connectDatabase();
    // Repository 가져오기
    const userRepo = AppDataSource.getRepository(User);
    const medicalRepo = AppDataSource.getRepository(MedicalInfo);
    const wheelchairRepo = AppDataSource.getRepository(Wheelchair);
    // ❌ [삭제] 삭제된 엔티티 Repository 제거
    // const mappingRepo = AppDataSource.getRepository(UserWheelchair);

    // --- 4. [트랜잭션] ---
    await AppDataSource.transaction(async (transactionalEntityManager) => {
      // 4-1. User 테이블: 닉네임 및 지역 정보 업데이트
      await transactionalEntityManager.update(User, userId, {
        nickname: nickname,
        location1: location1 || null,
        location2: location2 || null,
      });

      // 4-2. MedicalInfo 테이블: 의료 정보 (암호화)
      const encryptedData = encryptMedicalInfo({
        disabilityGrade: disabilityGrade,
        medicalConditions: medicalConditions,
      });

      // 기존 의료 정보가 있는지 확인 후 업데이트 혹은 생성 (로직 보강)
      const existingMedicalInfo = await transactionalEntityManager.findOne(
        MedicalInfo,
        { where: { userId } }
      );

      if (existingMedicalInfo) {
        await transactionalEntityManager.update(
          MedicalInfo,
          existingMedicalInfo.id,
          {
            ...encryptedData,
            updatedAt: new Date(),
          }
        );
      } else {
        await transactionalEntityManager.save(MedicalInfo, {
          userId: userId,
          ...encryptedData,
          updatedAt: new Date(),
        });
      }

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
          // 💡 [TODO] 만약 Wheelchair 엔티티에 직접 userId를 넣는 방식(1:N)으로 바뀐거라면 아래 주석 해제
          // userId: userId,
        });
      } else {
        console.log(
          `[API /profile] 기존 휠체어 정보 업데이트: ${deviceSerial}`
        );
        wheelchair.modelName = modelName || wheelchair.modelName;
        wheelchair.purchaseDate = purchaseDate || wheelchair.purchaseDate;
        // 💡 [TODO] 소유주 변경 로직이 필요하다면 추가
        // wheelchair.userId = userId;
      }

      await transactionalEntityManager.save(Wheelchair, wheelchair);

      // ❌ [삭제] 4-4. UserWheelchair (N:M 매핑) 로직 제거
      /* UserWheelchair 파일이 삭제되었으므로 이 부분은 실행할 수 없습니다.
         만약 '사용자'와 '휠체어'를 연결해야 한다면, 
         변경된 DB 구조(예: Wheelchair 엔티티에 ownerId 필드 등)에 맞춰
         위 4-3 단계에서 직접 연결해 주셔야 합니다.
      */
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
