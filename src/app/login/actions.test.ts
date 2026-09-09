import { describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({
  signIn: vi.fn(),
}));

import { signIn } from '@/auth';
import { signInWithGithub } from './actions';

const signInMock = vi.mocked(signIn);

describe('GitHub 登录动作', () => {
  it('把站内回跳地址传给 GitHub 登录', async () => {
    signInMock.mockResolvedValueOnce(undefined);
    const formData = new FormData();
    formData.set('callbackUrl', '/guide?next=%2Ftopics%2Fnew');
    await signInWithGithub(formData);
    expect(signInMock).toHaveBeenCalledWith('github', {
      redirectTo: '/guide?next=%2Ftopics%2Fnew',
    });
  });

  it('拦截外站回调地址，回退到广场', async () => {
    signInMock.mockResolvedValueOnce(undefined);
    const formData = new FormData();
    formData.set('callbackUrl', 'https://evil.example/phish');
    await signInWithGithub(formData);
    expect(signInMock).toHaveBeenCalledWith('github', { redirectTo: '/' });
  });
});
