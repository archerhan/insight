import { getCurrentUser } from '@/lib/auth/current-user';
import { getUnreadNotificationCount } from '@/db/services/notifications';
import { AppHeaderView, type AppHeaderUser } from './app-header-view';

/**
 * 全局壳顶栏（M1）：灼见品牌 + 导航（广场 / 我的战绩）+ 发起话题 CTA + 登录态。
 * 服务端取会话，客户端子组件负责路径高亮与交互。
 */
export async function AppHeader() {
  const user = await getCurrentUser();
  const headerUser: AppHeaderUser | null = user
    ? { displayName: user.displayName, avatarUrl: user.avatarUrl }
    : null;
  const unreadNotifications = user ? await getUnreadNotificationCount(user.id) : 0;
  return <AppHeaderView user={headerUser} unreadNotifications={unreadNotifications} />;
}
