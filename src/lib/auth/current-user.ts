import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getUserById } from '@/db/services/users';
import { loginHref } from '@/lib/auth/url';

/**
 * M1 会话桥：Auth.js session 只存 users.id，
 * 需要完整档案的页面统一走这里（服务端，权限收敛在 repository 层）。
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getUserById(session.user.id);
}

/** 需要登录的页面入口；未登录跳转到 /login?callbackUrl=当前路径。 */
export async function getCurrentUserOrRedirect(callbackUrl: string) {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(callbackUrl));
  return user;
}
