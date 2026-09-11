/** Auth.js 错误码 → 中文提示（登录页与登录表单共用）。 */
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: '邮箱或密码不正确',
  AccessDenied: '该账号已被停用，请联系管理员',
  Configuration: '服务端认证配置有误（Configuration），请查看容器日志',
  OAuthCallbackError: '第三方登录失败，请重试',
  OAuthAccountNotLinked: '该邮箱已用其他方式注册',
  Verification: '登录链接无效或已过期，请重新登录',
  MissingCSRF: '页面停留过久，请重新提交',
  SessionRequired: '请先登录',
};

export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code] ?? `登录失败（${code}）`;
}
