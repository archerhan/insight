import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

/** App Router 服务端入口：Route Handler 复用、页面 auth()、Server Actions signIn/signOut。 */
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
