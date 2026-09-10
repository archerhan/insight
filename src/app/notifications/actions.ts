"use server";

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { markAllNotificationsRead } from '@/db/services/notifications';
import { getUserById } from '@/db/services/users';
import { loginHref } from '@/lib/auth/url';

/** 一键全部已读（只作用于当前登录用户的通知）。 */
export async function markAllNotificationsReadAction(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect(loginHref('/notifications'));
  const user = await getUserById(session.user.id);
  if (!user) redirect(loginHref('/notifications'));
  await markAllNotificationsRead(user.id);
  // 重新校验根布局，确保顶栏未读角标在跳转前同步更新。
  revalidatePath('/', 'layout');
  redirect('/notifications');
}
