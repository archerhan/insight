export interface PasswordResetEmailInput {
  displayName: string;
  link: string;
  appUrl: string;
  expiresInMinutes: number;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function passwordResetEmail(input: PasswordResetEmailInput): RenderedEmail {
  const name = input.displayName.trim() || '你好';
  const subject = '【灼见】重置你的登录密码';
  const text = [
    `${name}：`,
    '',
    '我们收到了重置灼见账号密码的请求。点击下面的链接设置新密码：',
    input.link,
    '',
    `链接 ${input.expiresInMinutes} 分钟内有效，且只能使用一次。`,
    '如果这不是你本人的操作，忽略这封邮件即可，你的密码不会被改动。',
    '',
    `— 灼见 ${input.appUrl}`,
  ].join('\n');

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.7;color:#23211d">
  <p>${escapeHtml(name)}：</p>
  <p>我们收到了重置灼见账号密码的请求。点击下面的按钮设置新密码：</p>
  <p style="margin:24px 0">
    <a href="${escapeHtml(input.link)}" style="display:inline-block;background:#5b4bce;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">设置新密码</a>
  </p>
  <p style="color:#6b675e;font-size:13px">按钮打不开时，把下面的链接复制到浏览器：<br>${escapeHtml(input.link)}</p>
  <p style="color:#6b675e;font-size:13px">链接 ${input.expiresInMinutes} 分钟内有效，且只能使用一次。如果这不是你本人的操作，忽略这封邮件即可。</p>
  <p style="color:#6b675e;font-size:13px">— 灼见 ${escapeHtml(input.appUrl)}</p>
</div>`;

  return { subject, text, html };
}

export interface SignupCodeEmailInput {
  code: string;
  appUrl: string;
  expiresInMinutes: number;
}

export function signupCodeEmail(input: SignupCodeEmailInput): RenderedEmail {
  const subject = '【灼见】注册验证码';
  const text = [
    `你的灼见注册验证码是：${input.code}`,
    '',
    `验证码 ${input.expiresInMinutes} 分钟内有效，请勿转发给他人。`,
    '如果这不是你本人的操作，忽略这封邮件即可。',
    '',
    `— 灼见 ${input.appUrl}`,
  ].join('\n');

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.7;color:#23211d">
  <p>你的灼见注册验证码是：</p>
  <p style="margin:18px 0;font-size:28px;letter-spacing:6px;font-weight:600">${escapeHtml(input.code)}</p>
  <p style="color:#6b675e;font-size:13px">验证码 ${input.expiresInMinutes} 分钟内有效，请勿转发给他人。</p>
  <p style="color:#6b675e;font-size:13px">如果这不是你本人的操作，忽略这封邮件即可。</p>
  <p style="color:#6b675e;font-size:13px">— 灼见 ${escapeHtml(input.appUrl)}</p>
</div>`;

  return { subject, text, html };
}
