import type { NextAuthConfig } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { findOrCreateUserFromOAuth } from '@/db/services/users';

/**
 * NextAuth 配置（M1：GitHub OAuth，注册即建 users 档案）。
 * 拆成独立配置便于单测直接调用 callbacks；DB 侧只认稳定 auth_id，
 * 后续加"邮箱魔法链接"只需增补 provider 与 verification token 表。
 *
 * 环境变量由 Auth.js v5 自动推断：
 * AUTH_GITHUB_ID / AUTH_GITHUB_SECRET / AUTH_SECRET / AUTH_URL。
 */

interface GitHubProfileLike {
  name?: string | null;
  login?: string | null;
  avatar_url?: string | null;
}

export const authConfig = {
  providers: [GitHub],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === 'github') {
        const githubProfile = profile as GitHubProfileLike | undefined;
        const authId = `github:${account.providerAccountId}`;
        const displayName =
          githubProfile?.name?.trim() || githubProfile?.login?.trim() || '灼见用户';
        const avatarUrl = githubProfile?.avatar_url ?? null;
        const dbUser = await findOrCreateUserFromOAuth({ authId, displayName, avatarUrl });
        token.userId = dbUser.id;
        token.picture = avatarUrl ?? token.picture;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user = { ...session.user, id: token.userId } as typeof session.user;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
