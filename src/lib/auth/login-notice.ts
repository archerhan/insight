import { authErrorMessage } from '@/lib/auth/errors';

export interface LoginNotice {
  kind: 'error' | 'success' | 'info';
  text: string;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** 登录页顶部提示：Auth.js 错误码、重置成功、注册成功。 */
export function loginNotice(params: SearchParams): LoginNotice | null {
  const error = first(params.error);
  if (error) return { kind: 'error', text: authErrorMessage(error)! };
  if (first(params.reset)) return { kind: 'success', text: '密码已更新，请用新密码登录。' };
  if (first(params.registered)) return { kind: 'info', text: '账号已创建，请用邮箱和密码登录。' };
  if (first(params.loggedout)) return { kind: 'info', text: '你已退出登录。' };
  return null;
}
