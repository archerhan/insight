import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      /** 灼见 users.id（uuid），由 jwt 回调从 auth_id 建档后写入。 */
      id: string;
      /** 签发本会话时的 password_changed_at（ISO 串）；与库中不一致说明密码被重置，会话作废。 */
      pwdAt?: string | null;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    pwdAt?: string | null;
  }
}
