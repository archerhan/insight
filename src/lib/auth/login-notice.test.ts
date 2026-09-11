import { describe, expect, it } from 'vitest';
import { loginNotice } from './login-notice';
import { authErrorMessage } from './errors';

describe('登录页提示', () => {
  it('优先展示 Auth.js 错误码，并翻译成中文', () => {
    expect(loginNotice({ error: 'CredentialsSignin' })).toEqual({
      kind: 'error',
      text: '邮箱或密码不正确',
    });
    expect(loginNotice({ error: 'SomeNewCode' })?.text).toContain('SomeNewCode');
    expect(loginNotice({})).toBeNull();
  });

  it('重置成功 / 注册成功 / 退出登录各有提示', () => {
    expect(loginNotice({ reset: '1' })?.kind).toBe('success');
    expect(loginNotice({ registered: '1' })?.kind).toBe('info');
    expect(loginNotice({ loggedout: '1' })?.kind).toBe('info');
  });

  it('未知错误码原样带出，便于排查', () => {
    expect(authErrorMessage(null)).toBeNull();
    expect(authErrorMessage('Configuration')).toContain('服务端');
  });
});
