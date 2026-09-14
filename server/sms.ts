// OTP SMS delivery. Netgsm in production, console output in development.

const NETGSM_OTP_URL = 'https://api.netgsm.com.tr/sms/send/otp';

const NETGSM_ERRORS: Record<string, string> = {
  '20': 'Mesaj metni veya boyu hatalı',
  '30': 'Geçersiz kullanıcı adı/şifre, API erişim izni yok veya IP kısıtı',
  '40': 'Gönderici adı (msgheader) hatalı',
  '41': 'Gönderici adı (msgheader) hatalı',
  '50': 'Numara hatalı',
  '60': 'Hesapta OTP SMS paketi tanımlı değil',
  '70': 'Girdi parametreleri hatalı',
  '80': 'Gönderim sınırı aşıldı (dakikada 100)',
  '100': 'Netgsm sistem hatası'
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getProvider(): 'netgsm' | 'console' {
  const configured = process.env.SMS_PROVIDER;
  if (configured === 'netgsm' || configured === 'console') return configured;
  return process.env.NODE_ENV === 'production' ? 'netgsm' : 'console';
}

async function sendViaNetgsm(phone: string, message: string): Promise<void> {
  const usercode = process.env.NETGSM_USERCODE;
  const password = process.env.NETGSM_PASSWORD;
  const msgheader = process.env.NETGSM_MSGHEADER;
  if (!usercode || !password || !msgheader) {
    throw new Error('Netgsm is not configured (NETGSM_USERCODE, NETGSM_PASSWORD, NETGSM_MSGHEADER)');
  }

  const xml = `<?xml version="1.0"?>
<mainbody>
  <header>
    <usercode>${escapeXml(usercode)}</usercode>
    <password>${escapeXml(password)}</password>
    <msgheader>${escapeXml(msgheader)}</msgheader>
  </header>
  <body>
    <msg><![CDATA[${message}]]></msg>
    <no>${escapeXml(phone)}</no>
  </body>
</mainbody>`;

  const response = await fetch(NETGSM_OTP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body: xml,
    signal: AbortSignal.timeout(10_000)
  });
  const text = await response.text();

  const jobId = text.match(/<jobID>\s*([^<\s]+)\s*<\/jobID>/i)?.[1];
  if (response.ok && jobId) return;

  const code = text.match(/<code>\s*(\d+)\s*<\/code>/i)?.[1];
  const reason = (code && NETGSM_ERRORS[code]) || `HTTP ${response.status}`;
  throw new Error(`Netgsm OTP failed (code ${code ?? 'unknown'}): ${reason}`);
}

export async function sendOtpSms(phone: string, code: string): Promise<void> {
  // Netgsm OTP messages do not support Turkish characters
  const message = `RALO dogrulama kodunuz: ${code}. Bu kodu kimseyle paylasmayin.`;

  if (getProvider() === 'netgsm') {
    await sendViaNetgsm(phone, message);
    return;
  }

  if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'true') {
    throw new Error('Console SMS provider is disabled in production');
  }
  console.log(`[DEV SMS] ${phone}: ${message}`);
}
