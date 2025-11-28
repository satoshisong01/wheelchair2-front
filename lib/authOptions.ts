// 📍 경로: lib/authOptions.ts

import { NextAuthOptions } from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";
import CredentialsProvider from "next-auth/providers/credentials";
import { query } from "@/lib/db"; 
import { createAuditLog } from "@/lib/log"; 

export const authOptions: NextAuthOptions = {
    providers: [
        // ------------------------------
        // 1. 카카오 로그인 프로바이더
        // ------------------------------
        KakaoProvider({
            clientId: process.env.KAKAO_CLIENT_ID || '',
            clientSecret: process.env.KAKAO_CLIENT_SECRET || '',
        }),
        
        // ------------------------------
        // 2. 관리자용 Credentials 프로바이더 (선택 사항)
        // ------------------------------
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "text" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                // 이 로직은 로컬 관리자 계정(DB에 별도 저장된)을 위한 것일 수 있습니다.
                // 현재는 카카오 로그인을 주력으로 사용한다고 가정하고 DB 조회 로직을 생략합니다.
                // 필요하다면 여기에 DB에서 email/password를 확인하는 코드를 추가해야 합니다.
                return null; 
            }
        })
    ],

    session: { 
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },

    callbacks: {
        async signIn({ user, account, profile }) {
             if (account?.provider === 'kakao') {
                const kakaoId = String((profile as any).id);
                const email = (profile as any).kakao_account?.email || '';
                const name = (profile as any).kakao_account?.profile?.nickname || '';

                try {
                    // 사용자 조회 및 업데이트/생성 로직
                    const userRes = await query(`
                        SELECT id, role FROM users WHERE kakao_id = $1
                    `, [kakaoId]);

                    if (userRes.rowCount > 0) {
                        // 기존 사용자: 마지막 로그인 시간 업데이트
                        await query(`
                            UPDATE users SET last_login_at = NOW() WHERE kakao_id = $1
                        `, [kakaoId]);
                    } else {
                        // 신규 사용자: PENDING 상태로 가입
                        await query(`
                            INSERT INTO users (kakao_id, email, name, role, created_at, last_login_at)
                            VALUES ($1, $2, $3, 'PENDING', NOW(), NOW())
                        `, [kakaoId, email, name]);
                    }
                    return true;
                } catch (error) {
                    console.error("Database error during Kakao sign-in:", error);
                    return false;
                }
            }
            return true;
        },

        async jwt({ token, user, account, profile }) {
            // 카카오 로그인인 경우: DB에서 최신 Role과 전체 프로필 정보 가져오기
            if (account?.provider === 'kakao' && profile) {
                 const kakaoId = String((profile as any).id);
                 
                 const dbUserRes = await query(
                    // ⭐️ [쿼리] 모든 필수 필드 조회
                    `SELECT id, role, organization, phone_number, name, email FROM users WHERE kakao_id = $1`, 
                    [kakaoId]
                 );
                 
                 const dbUser = dbUserRes.rows[0];
                
                 if (dbUser) {
                    // JWT 토큰에 DB에서 조회한 모든 사용자 정보 주입
                    token.id = dbUser.id;
                    token.role = dbUser.role;
                    token.name = dbUser.name;
                    token.email = dbUser.email;
                    token.organization = dbUser.organization;
                    token.phoneNumber = dbUser.phone_number;
                    
                    // ⭐️ [LOG INJECTION] ADMIN/MASTER 로그인 성공 로그 기록
                    if (dbUser.role === 'ADMIN' || dbUser.role === 'MASTER') {
                        createAuditLog({ 
                            userId: dbUser.id, 
                            userRole: dbUser.role, 
                            action: 'LOGIN', 
                            details: { email: dbUser.email } 
                        });
                    }
                 }
            }
            
            return token;
        },

        async session({ session, token }) {
            // 세션 객체에 모든 토큰 정보 주입 (UI 컴포넌트에서 useSession으로 사용 가능)
            if (session.user) {
                session.user.id = token.id as string;
                session.user.role = token.role as string;
                session.user.name = token.name as string;
                session.user.email = token.email as string;
                session.user.organization = token.organization as string;
                session.user.phoneNumber = token.phoneNumber as string;
            }
            return session;
        },
    },
    
    // 에러 페이지 설정
    pages: {
        signIn: "/auth/signin", // 로그인 페이지 경로
        error: "/auth/error", // 에러 발생 시 경로
        // signOut: "/auth/signout", // 로그아웃 경로 (옵션)
    },
    
    // NextAuth 내부 디버그 설정 (개발 시 유용)
    // debug: process.env.NODE_ENV === "development",
};