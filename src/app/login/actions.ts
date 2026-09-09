"use server";

import { signIn } from '@/auth';
import { safeRelativeUrl } from '@/lib/auth/url';

export async function signInWithGithub(formData: FormData) {
  const raw = formData.get('callbackUrl');
  await signIn('github', {
    redirectTo: safeRelativeUrl(typeof raw === 'string' ? raw : null),
  });
}
