import { config } from 'dotenv';
import { fromAddress, mailerMode, sendMail } from './mailer';

config({ path: ['.env.local', '.env'] });

/**
 * 手动验证邮件通道：`pnpm mail:test you@example.com`
 * 会按当前配置（Resend / SMTP / 控制台）真实发一封测试邮件并打印结果。
 */
async function main() {
  const to = process.argv[2];
  if (!to || !to.includes('@')) {
    console.error('用法：pnpm mail:test you@example.com');
    process.exit(1);
  }

  const mode = mailerMode();
  console.info(
    `[mail:test] 模式=${mode} 发件人=${fromAddress() || '(未配置)'} 收件人=${to} NODE_ENV=${process.env.NODE_ENV ?? 'development'}`,
  );

  const result = await sendMail({
    to,
    subject: '【灼见】邮件通道测试',
    text: [
      '这是一封来自灼见部署环境的测试邮件。',
      '',
      '收到它就说明注册验证码 / 找回密码的邮件通道已经打通。',
    ].join('\n'),
    html: '<p>这是一封来自灼见部署环境的测试邮件。</p><p>收到它就说明注册验证码 / 找回密码的邮件通道已经打通。</p>',
  });

  if (!result.ok) {
    console.error(`[mail:test] 发送失败：${result.error}${result.detail ? ` — ${result.detail}` : ''}`);
    process.exit(1);
  }
  console.info(
    mode === 'console'
      ? '[mail:test] 当前是控制台模式（未配置 Resend/SMTP），邮件内容已打印在上方日志里'
      : '[mail:test] 发送成功（Resend 控制台 Emails 页可看到投递记录）',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
