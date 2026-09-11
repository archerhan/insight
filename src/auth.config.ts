import type { NextAuthConfig } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Credentials from 'next-auth/providers/credentials';
import { findOrCreateUserFromOAuth, getUserById, verifyUserCredentials } from '@/db/services/users';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { isValidEmail, normalizeEmail } from '@/lib/auth/validation';

/**
 * NextAuth 配置：GitHub OAuth + 邮箱密码（credentials）。
 * 拆成独立配置便于单测直接调用 callbacks；OAuth 侧只认稳定 auth_id，
 * 邮箱侧以 users.email + scrypt 密码哈希为准。
 *
 * 环境变量由 Auth.js v5 自动推断：
 * AUTH_GITHUB_ID / AUTH_GITHUB_SECRET / AUTH_SECRET / AUTH_URL。
 */

interface GitHubProfileLike {
  name?: string | null;
  login?: string | null;
  avatar_url?: string | null;
}

function clientIp(request: Request | undefined): string {
  const forwarded = request?.headers?.get?.('x-forwarded-for');
  if (!forwarded) return 'unknown';
  return forwarded.split(',')[0]?.trim() || 'unknown';
}

export const authConfig = {
  providers: [
    GitHub,
    Credentials({
      id: 'credentials',
      name: '邮箱密码',
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(rawCredentials, request) {
        const email = normalizeEmail(String(rawCredentials?.email ?? ''));
        const password = String(rawCredentials?.password ?? '');
        if (!isValidEmail(email) || password.length === 0) return null;

        const allowed = consumeRateLimit(
          `credentials:${email}:${clientIp(request)}`,
          RATE_LIMITS.login,
        ).allowed;
        if (!allowed) return null;

        const user = await verifyUserCredentials(email, password);
        if (!user) return null;
        return { id: user.id, name: user.displayName, email: user.email };
      },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account?.provider === 'github') {
        const githubProfile = profile as GitHubProfileLike | undefined;
        const authId = `github:${account.providerAccountId}`;
        const displayName =
          githubProfile?.name?.trim() || githubProfile?.login?.trim() || '灼见用户';
        const avatarUrl = githubProfile?.avatar_url ?? null;
        const dbUser = await findOrCreateUserFromOAuth({ authId, displayName, avatarUrl });
        token.userId = dbUser.id;
        token.picture = avatarUrl ?? token.picture;
        token.pwdAt = dbUser.passwordChangedAt?.toISOString() ?? null;
      }
      if (account?.provider === 'credentials' && user?.id) {
        const dbUser = await getUserById(user.id);
        if (!dbUser || dbUser.status !== 'active') return null;
        token.userId = dbUser.id;
        token.name = dbUser.displayName;
        token.email = dbUser.email ?? undefined;
        token.picture = dbUser.avatarUrl ?? undefined;
        token.pwdAt = dbUser.passwordChangedAt?.toISOString() ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user = {
          ...session.user,
          id: token.userId,
          pwdAt: token.pwdAt ?? null,
        } as typeof session.user;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
