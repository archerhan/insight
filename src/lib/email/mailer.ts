import nodemailer, { type Transporter } from 'nodemailer';

/**
 * 邮件发送：优先 Resend HTTP API（配置 RESEND_API_KEY 即启用），
 * 其次通用 SMTP（阿里云邮件推送 / QQ 企业邮 / Resend SMTP 均可）。
 * 本地开发都没配时把邮件内容打到控制台，方便直接拿到验证码/重置链接；
 * 生产未配置则明确返回配置错误，由上层提示用户，而不是静默丢失。
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type MailFailure = 'not_configured' | 'send_failed';

export type MailResult = { ok: true } | { ok: false; error: MailFailure; detail?: string };

export type MailerMode = 'resend' | 'smtp' | 'console' | 'disabled';

export type MailProvider = 'resend' | 'smtp';

export interface ResendConfig {
  apiKey: string;
  from: string;
  endpoint: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

type Env = Record<string, string | undefined>;

/** 发件人地址：通用 MAIL_FROM，兼容旧的 SMTP_FROM。 */
export function fromAddress(env: Env = process.env): string {
  return (env.MAIL_FROM ?? env.SMTP_FROM)?.trim() ?? '';
}

/** SMTP 只要配了 host 和发件人就认为可以发信（允许匿名中继/内网 relay）。 */
export function isMailerConfigured(env: Env = process.env): boolean {
  return Boolean(env.SMTP_HOST?.trim() && fromAddress(env));
}

export function isResendConfigured(env: Env = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && fromAddress(env));
}

/**
 * 通道选择：MAIL_PROVIDER 显式指定（resend/smtp）优先；
 * 未指定时按 有 RESEND_API_KEY 走 Resend、否则有 SMTP_HOST 走 SMTP。
 */
export function resolveMailProvider(env: Env = process.env): MailProvider | null {
  const explicit = env.MAIL_PROVIDER?.trim().toLowerCase();
  if (explicit === 'resend' || explicit === 'smtp') return explicit;
  if (isResendConfigured(env)) return 'resend';
  if (isMailerConfigured(env)) return 'smtp';
  return null;
}

export function mailerMode(env: Env = process.env): MailerMode {
  const provider = resolveMailProvider(env);
  const configured =
    provider === 'resend'
      ? isResendConfigured(env)
      : provider === 'smtp'
        ? isMailerConfigured(env)
        : false;
  if (configured && provider) return provider;
  return env.NODE_ENV === 'production' ? 'disabled' : 'console';
}

export function resolveResendConfig(env: Env = process.env): ResendConfig | null {
  if (!isResendConfigured(env)) return null;
  return {
    apiKey: env.RESEND_API_KEY!.trim(),
    from: fromAddress(env),
    endpoint: env.RESEND_API_URL?.trim() || 'https://api.resend.com/emails',
  };
}

export function resolveSmtpConfig(env: Env = process.env): SmtpConfig | null {
  if (!isMailerConfigured(env)) return null;
  const port = Number(env.SMTP_PORT ?? 465);
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE !== 'false' : port === 465;
  return {
    host: env.SMTP_HOST!.trim(),
    port: Number.isFinite(port) && port > 0 ? port : 465,
    secure,
    user: env.SMTP_USER?.trim() || undefined,
    pass: env.SMTP_PASS || undefined,
    from: fromAddress(env),
  };
}

let cachedTransporter: Transporter | null = null;
let cachedSignature = '';

function getTransporter(config: SmtpConfig): Transporter {
  const signature = `${config.host}:${config.port}:${config.secure}:${config.user ?? ''}`;
  if (cachedTransporter && cachedSignature === signature) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });
  cachedSignature = signature;
  return cachedTransporter;
}

async function sendViaResend(message: MailMessage, env: Env): Promise<MailResult> {
  const config = resolveResendConfig(env);
  if (!config) return { ok: false, error: 'not_configured' };

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return {
        ok: false,
        error: 'send_failed',
        detail: `HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: 'send_failed',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendMail(message: MailMessage, env: Env = process.env): Promise<MailResult> {
  const mode = mailerMode(env);

  if (mode === 'disabled') {
    return { ok: false, error: 'not_configured' };
  }

  if (mode === 'console') {
    console.info(
      `[mailer] 未配置邮件服务，以下内容仅打印到日志：\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`,
    );
    return { ok: true };
  }

  if (mode === 'resend') return sendViaResend(message, env);

  const config = resolveSmtpConfig(env);
  if (!config) return { ok: false, error: 'not_configured' };

  try {
    await getTransporter(config).sendMail({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: 'send_failed',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** 测试用：清掉缓存的 transporter。 */
export function resetMailerCache(): void {
  cachedTransporter = null;
  cachedSignature = '';
}
