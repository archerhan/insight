"use server";

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { markCourseCompleted } from '@/db/services/users';
import { safeRelativeUrl } from '@/lib/auth/url';

export async function completeCourse(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  await markCourseCompleted(session.user.id);
  const rawNext = formData.get('next');
  redirect(safeRelativeUrl(typeof rawNext === 'string' ? rawNext : null, '/topics/new'));
}
