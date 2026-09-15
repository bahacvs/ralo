import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// Transactional email: verification, password reset and staff invitation links.
// MAIL_PROVIDER=smtp sends through SMTP_* (a Gmail account with an app password works; limit ~500/day).
// MAIL_PROVIDER=console prints the message to the server log. Default: smtp in production, console otherwise.

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

type MailProvider = 'smtp' | 'console';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

let transporter: Transporter | null = null;

function mailProvider(): MailProvider {
  const configured = process.env.MAIL_PROVIDER;
  if (configured === 'smtp' || configured === 'console') return configured;
  return IS_PRODUCTION ? 'smtp' : 'console';
}

/** Fails fast at boot when production cannot deliver email (nobody could verify or reset a password). */
export function assertMailConfigured(): void {
  if (!IS_PRODUCTION) return;
  if (mailProvider() === 'console') {
    if (process.env.DEMO_MODE === 'true') return;
    throw new Error('MAIL_PROVIDER=console is not allowed in production');
  }
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP_USER and SMTP_PASS are required in production');
  }
}

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error('SMTP is not configured (SMTP_USER, SMTP_PASS)');
  }
  const port = Number(process.env.SMTP_PORT) || 465;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass }
  });
  return transporter;
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (mailProvider() === 'console') {
    if (IS_PRODUCTION && process.env.DEMO_MODE !== 'true') {
      throw new Error('MAIL_PROVIDER=console is not allowed in production');
    }
    console.log(`[mail] to=${message.to} subject="${message.subject}"\n${message.text}\n`);
    return;
  }
  const from = process.env.MAIL_FROM || `RALO <${process.env.SMTP_USER}>`;
  await getTransporter().sendMail({ from, ...message });
}

// -------------------------------------------------------------
// Templates
// -------------------------------------------------------------

function appUrl(): string {
  return (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

// Tokens travel in the URL fragment, which browsers never send to servers or in Referer headers.
function linkEmail(options: {
  to: string;
  subject: string;
  greetingName: string;
  intro: string;
  buttonLabel: string;
  link: string;
  footer: string;
}): MailMessage {
  const { to, subject, greetingName, intro, buttonLabel, link, footer } = options;
  const text = `Merhaba ${greetingName},\n\n${intro}\n\n${buttonLabel}: ${link}\n\n${footer}\n\nRALO`;
  const html = `<!doctype html>
<html lang="tr"><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px">
    <tr><td style="padding:28px">
      <p style="margin:0 0 20px;font-size:20px;font-weight:900;letter-spacing:3px">RALO</p>
      <p style="margin:0 0 12px;font-size:15px">Merhaba ${escapeHtml(greetingName)},</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5">${escapeHtml(intro)}</p>
      <p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 22px;background:#f59e0b;color:#0f172a;text-decoration:none;font-weight:700;border-radius:10px">${escapeHtml(buttonLabel)}</a></p>
      <p style="margin:0 0 8px;font-size:12px;color:#64748b;line-height:1.5">Düğme çalışmazsa bu bağlantıyı tarayıcınıza yapıştırın:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
      <p style="margin:16px 0 0;font-size:12px;color:#64748b;line-height:1.5">${escapeHtml(footer)}</p>
    </td></tr>
  </table>
</body></html>`;
  return { to, subject, text, html };
}

export function verificationEmail(to: string, name: string, token: string): MailMessage {
  return linkEmail({
    to,
    subject: 'RALO e-posta adresinizi doğrulayın',
    greetingName: name,
    intro: 'RALO hesabınızı oluşturduğunuz için teşekkürler. Kort rezervasyonu yapabilmek için e-posta adresinizi doğrulayın.',
    buttonLabel: 'E-postamı Doğrula',
    link: `${appUrl()}/eposta-dogrula#token=${token}`,
    footer: 'Bağlantı 48 saat geçerlidir. Bu hesabı siz oluşturmadıysanız bu e-postayı dikkate almayın.'
  });
}

export function passwordResetEmail(to: string, name: string, token: string): MailMessage {
  return linkEmail({
    to,
    subject: 'RALO şifre sıfırlama',
    greetingName: name,
    intro: 'Hesabınız için şifre sıfırlama isteği aldık. Yeni şifrenizi belirlemek için aşağıdaki bağlantıyı kullanın.',
    buttonLabel: 'Şifremi Sıfırla',
    link: `${appUrl()}/sifre-sifirla#token=${token}`,
    footer: 'Bağlantı 1 saat geçerlidir ve yalnızca bir kez kullanılabilir. Bu isteği siz yapmadıysanız şifreniz değişmez; bu e-postayı dikkate almayın.'
  });
}

export function staffInviteEmail(to: string, name: string, businessName: string, token: string): MailMessage {
  return linkEmail({
    to,
    subject: `${businessName} sizi RALO işletme paneline davet etti`,
    greetingName: name,
    intro: `${businessName} sizi RALO işletme panelinde personel olarak ekledi. Hesabınızı kullanmaya başlamak için bir şifre belirleyin.`,
    buttonLabel: 'Şifremi Belirle',
    link: `${appUrl()}/sifre-sifirla#token=${token}&davet=1`,
    footer: 'Bağlantı 7 gün geçerlidir. Bu daveti beklemiyorsanız bu e-postayı dikkate almayın.'
  });
}
