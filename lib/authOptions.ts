import { NextAuthOptions } from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";
import CredentialsProvider from "next-auth/providers/credentials";
import { query } from "@/lib/db"; 
import { createAuditLog } from "@/lib/log"; // 감사 로그 유틸리티

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
        // 2. 기기 로그인 프로바이더 (Credentials)
        // ------------------------------
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "text" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                // 이 로직은 현재 구현 주체가 아니므로 null 반환 (실제 코드는 device login)
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
                    // 1. 사용자 조회 (kakao_id로)
                    const userRes = await query(`
                        SELECT id, role FROM users WHERE kakao_id = $1
                    `, [kakaoId]);

                    if (userRes.rowCount > 0) {
                        // 2. [기존 사용자] last_login_at 업데이트 ⭐️ FIX: 컬럼 누락 에러 해결
                        await query(`
                            UPDATE users SET last_login_at = NOW() WHERE kakao_id = $1
                        `, [kakaoId]);
                    } else {
                        // 3. [신규 사용자] GUEST 상태로 가입 ⭐️ last_login_at 컬럼 추가
                        await query(`
                            INSERT INTO users (kakao_id, email, name, role, created_at, last_login_at)
                            VALUES ($1, $2, $3, 'GUEST', NOW(), NOW())
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
                    // ⭐️ [쿼리] 모든 필드 조회: 토큰에 organization, phoneNumber 주입을 위함
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
            
            // Credentials 로그인 등 기타 경우 처리 (생략)
            
            return token;
        },

        async session({ session, token }) {
            // 세션 객체에 모든 토큰 정보 주입 (클라이언트 사용 목적)
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
    
    pages: {
        signIn: "/login",
        error: "/auth/error", 
    },
};