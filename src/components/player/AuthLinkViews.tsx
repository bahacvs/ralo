import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { passwordProblem, PasswordInput, primaryButtonClass } from './LoginView.js';
import { CheckCircle2, AlertCircle, KeyRound, MailCheck, ArrowRight } from 'lucide-react';

// Emailed links carry their one-time token in the URL fragment (#token=...), which is never sent to
// the server or leaked through Referer headers. The fragment is removed from the address bar once read.

function readLinkParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.slice(1));
}

function clearLinkFragment() {
  if (window.location.hash) {
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }
}

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="max-w-md mx-auto py-8 px-4 sm:px-0">
    <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm space-y-5">
      {children}
    </div>
  </div>
);

const StatusHeader: React.FC<{ tone: 'success' | 'error' | 'neutral'; title: string; message?: string }> = ({ tone, title, message }) => {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertCircle : KeyRound;
  const iconClass = tone === 'success' ? 'text-emerald-600 bg-emerald-50' : tone === 'error' ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50';
  return (
    <div className="text-center space-y-2">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${iconClass}`} aria-hidden="true">
        <Icon className="w-7 h-7" />
      </div>
      <h1 className="text-lg font-black text-slate-900">{title}</h1>
      {message && <p className="text-sm text-slate-600" role={tone === 'error' ? 'alert' : 'status'}>{message}</p>}
    </div>
  );
};

export const VerifyEmailView: React.FC = () => {
  const { user, navigate, refreshUser } = useAuth();
  const [token] = useState(() => readLinkParams().get('token'));
  const [status, setStatus] = useState<'LOADING' | 'SUCCESS' | 'ERROR'>(token ? 'LOADING' : 'ERROR');
  const [message, setMessage] = useState(token ? '' : 'Doğrulama bağlantısı eksik. Lütfen e-postadaki bağlantıyı yeniden açın.');
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    clearLinkFragment();
    // The token is single-use: StrictMode runs effects twice, the ref keeps it to one request
    if (!token || started.current) return;
    started.current = true;
    api.verifyEmail(token)
      .then(res => {
        setStatus('SUCCESS');
        setMessage(res.message);
        if (user) void refreshUser();
      })
      .catch((err: any) => {
        setStatus('ERROR');
        setMessage(err.message || 'Doğrulama bağlantısı geçersiz veya süresi dolmuş.');
      });
  }, []);

  const resend = async () => {
    try {
      const res = await api.resendVerification();
      setResendNotice(res.message);
    } catch (err: any) {
      setResendNotice(err.message || 'Bağlantı gönderilemedi.');
    }
  };

  if (status === 'LOADING') {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-6" role="status" aria-live="polite">
          <span className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" aria-hidden="true" />
          <span className="text-sm text-slate-600">E-posta adresiniz doğrulanıyor...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <StatusHeader
        tone={status === 'SUCCESS' ? 'success' : 'error'}
        title={status === 'SUCCESS' ? 'E-posta adresiniz doğrulandı' : 'Doğrulama tamamlanamadı'}
        message={message}
      />
      {status === 'SUCCESS' ? (
        <button type="button" onClick={() => navigate(user ? '/sahalar' : '/giris')} className={primaryButtonClass}>
          <span>{user ? 'Kort Ara' : 'Giriş Yap'}</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      ) : user && !user.emailVerified ? (
        <div className="space-y-3">
          <button type="button" onClick={resend} className={primaryButtonClass}>
            <MailCheck className="w-4 h-4" aria-hidden="true" />
            <span>Yeni Doğrulama Bağlantısı Gönder</span>
          </button>
          {resendNotice && <p className="text-xs text-center text-slate-600" role="status">{resendNotice}</p>}
        </div>
      ) : (
        <button type="button" onClick={() => navigate(user ? '/ana' : '/giris')} className={primaryButtonClass}>
          <span>{user ? 'Ana Sayfaya Dön' : 'Giriş Yap'}</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </Card>
  );
};

export const ResetPasswordView: React.FC = () => {
  const { completeAuth, navigate } = useAuth();
  const [params] = useState(readLinkParams);
  const token = params.get('token');
  const isInvite = params.get('davet') === '1';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clearLinkFragment();
  }, []);

  if (!token) {
    return (
      <Card>
        <StatusHeader tone="error" title="Bağlantı geçersiz" message="Şifre bağlantısı eksik veya bozuk. Giriş ekranından yeni bir bağlantı isteyebilirsiniz." />
        <button type="button" onClick={() => navigate('/giris')} className={primaryButtonClass}>
          <span>Giriş Ekranına Git</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </Card>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirm) {
      setError('Girdiğiniz şifreler eşleşmiyor.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.resetPassword(token, password);
      completeAuth(res.token, res.user);
    } catch (err: any) {
      setError(err.message || 'Şifre güncellenemedi. Lütfen yeni bir bağlantı isteyin.');
      setLoading(false);
    }
  };

  return (
    <Card>
      <StatusHeader
        tone="neutral"
        title={isInvite ? 'Şifrenizi belirleyin' : 'Yeni şifre belirleyin'}
        message={isInvite
          ? 'İşletme paneline erişmek için hesabınıza bir şifre belirleyin.'
          : 'Şifreniz değiştiğinde diğer cihazlardaki oturumlarınız kapatılır.'}
      />

      {error && (
        <div role="alert" className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" aria-hidden="true" />
          <span className="font-semibold">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="reset-password" className="block text-xs font-bold text-slate-800 mb-1.5">Yeni Şifre</label>
          <PasswordInput id="reset-password" value={password} onChange={setPassword} autoComplete="new-password" describedBy="reset-password-hint" />
          <p id="reset-password-hint" className="text-[11px] text-slate-500 mt-1">En az 8 karakter; en az bir harf ve bir rakam.</p>
        </div>
        <div>
          <label htmlFor="reset-password-confirm" className="block text-xs font-bold text-slate-800 mb-1.5">Yeni Şifre (Tekrar)</label>
          <PasswordInput id="reset-password-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>
        <button type="submit" disabled={loading} className={primaryButtonClass}>
          <span>{loading ? 'Kaydediliyor...' : 'Şifreyi Kaydet ve Giriş Yap'}</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </form>
    </Card>
  );
};
