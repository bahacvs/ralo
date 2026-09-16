import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { Mail, Lock, UserRound, ArrowRight, ShieldCheck, AlertCircle, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { RaloIcon } from '../common/RaloLogo.js';

type Mode = 'LOGIN' | 'REGISTER' | 'FORGOT';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const inputClass =
  'w-full min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500';
export const primaryButtonClass =
  'w-full min-h-[48px] px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black transition-colors flex items-center justify-center gap-2 shadow-xs focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer';
const linkButtonClass = 'text-xs text-amber-700 hover:text-amber-800 font-semibold cursor-pointer';

const SUBTITLES: Record<Mode, string> = {
  LOGIN: 'E-posta adresiniz ve şifrenizle giriş yapın',
  REGISTER: 'Ücretsiz hesap oluşturun, kort ayırın ve maçlara katılın',
  FORGOT: 'Şifre sıfırlama bağlantısını e-posta adresinize gönderelim'
};

/** Mirrors the server rules in server/auth.ts validatePassword(). */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Şifre en az 8 karakter olmalıdır.';
  if (password.length > 128) return 'Şifre en fazla 128 karakter olabilir.';
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return 'Şifre en az bir harf ve bir rakam içermelidir.';
  return null;
}

export const PasswordInput: React.FC<{
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  describedBy?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}> = ({ id, value, onChange, autoComplete, describedBy, inputRef }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
        maxLength={128}
        className={`${inputClass} pr-12`}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Şifreyi gizle' : 'Şifreyi göster'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 w-12 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
      >
        {visible ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
      </button>
    </div>
  );
};

export const LoginView: React.FC = () => {
  const { login, register } = useAuth();

  const [mode, setMode] = useState<Mode>('LOGIN');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [shareCardConsent, setShareCardConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setTimeout(() => (next === 'REGISTER' ? nameRef : emailRef).current?.focus(), 50);
  };

  const fail = (message: string, field?: React.RefObject<HTMLInputElement | null>) => {
    setError(message);
    field?.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (mode === 'REGISTER' && !displayName.trim()) {
      return fail('Lütfen adınızı ve soyadınızı giriniz.', nameRef);
    }
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      return fail('Lütfen geçerli bir e-posta adresi giriniz.', emailRef);
    }
    if (mode === 'LOGIN' && !password) {
      return fail('Lütfen şifrenizi giriniz.', passwordRef);
    }
    if (mode === 'REGISTER') {
      const problem = passwordProblem(password);
      if (problem) return fail(problem, passwordRef);
      if (!acceptTerms) return fail('Devam etmek için Kullanım Koşulları\'nı ve KVKK Aydınlatma Metni\'ni onaylayın.');
    }

    setLoading(true);
    try {
      if (mode === 'LOGIN') {
        await login(trimmedEmail, password);
      } else if (mode === 'REGISTER') {
        await register({ displayName: displayName.trim(), email: trimmedEmail, password, acceptTerms, shareCardConsent });
      } else {
        const res = await api.forgotPassword(trimmedEmail);
        setNotice(res.message);
      }
    } catch (err: any) {
      setError(err.message || 'İşlem tamamlanamadı. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const submitLabel = loading
    ? 'Lütfen bekleyin...'
    : mode === 'LOGIN' ? 'Giriş Yap' : mode === 'REGISTER' ? 'Hesap Oluştur' : 'Sıfırlama Bağlantısı Gönder';

  return (
    <div className="max-w-md mx-auto py-8 px-4 sm:px-0">

      {/* Brand Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-amber-500/40 flex items-center justify-center mx-auto shadow-lg shadow-amber-950/20 mb-3 p-2" aria-hidden="true">
          <RaloIcon size={44} />
        </div>
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <h1 className="text-3xl font-black text-slate-900 tracking-[0.14em] uppercase font-sans">
            RALO
          </h1>
          <span className="w-2 h-2 rounded-full bg-amber-500 self-center" />
        </div>
        <p className="text-[11px] font-extrabold text-amber-600 tracking-[0.22em] uppercase">
          The Social Network for Padel
        </p>
        <p className="text-xs text-slate-500 mt-1">{SUBTITLES[mode]}</p>
      </div>

      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm space-y-5">

        {mode !== 'FORGOT' && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100" role="tablist" aria-label="Giriş veya kayıt">
            {(['LOGIN', 'REGISTER'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={mode === tab}
                onClick={() => mode !== tab && switchMode(tab)}
                className={`min-h-[40px] rounded-xl text-xs font-black transition-colors cursor-pointer ${
                  mode === tab ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab === 'LOGIN' ? 'Giriş Yap' : 'Kayıt Ol'}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div role="alert" aria-live="assertive" className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" aria-hidden="true" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {notice && (
          <div role="status" aria-live="polite" className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span className="font-semibold">{notice}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {mode === 'REGISTER' && (
            <div>
              <label htmlFor="auth-name" className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                <UserRound className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                <span>Ad Soyad</span>
              </label>
              <input
                ref={nameRef}
                id="auth-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Adınız Soyadınız"
                autoComplete="name"
                maxLength={60}
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
              <span>E-posta Adresi</span>
            </label>
            <input
              ref={emailRef}
              id="auth-email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@eposta.com"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              className={inputClass}
            />
          </div>

          {mode !== 'FORGOT' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="auth-password" className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                  <span>Şifre</span>
                </label>
                {mode === 'LOGIN' && (
                  <button type="button" onClick={() => switchMode('FORGOT')} className={linkButtonClass}>
                    Şifremi unuttum
                  </button>
                )}
              </div>
              <PasswordInput
                id="auth-password"
                value={password}
                onChange={setPassword}
                autoComplete={mode === 'LOGIN' ? 'current-password' : 'new-password'}
                describedBy={mode === 'REGISTER' ? 'password-hint' : undefined}
                inputRef={passwordRef}
              />
              {mode === 'REGISTER' && (
                <p id="password-hint" className="text-[11px] text-slate-500 mt-1">
                  En az 8 karakter; en az bir harf ve bir rakam.
                </p>
              )}
            </div>
          )}

          {mode === 'REGISTER' && (
            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-amber-500 shrink-0"
              />
              <span>
                <a href="/yasal/kullanim-kosullari" target="_blank" rel="noopener" className="font-bold underline text-amber-800">Kullanım Koşulları</a>'nı okudum, kabul ediyorum;{' '}
                <a href="/yasal/kvkk-aydinlatma-metni" target="_blank" rel="noopener" className="font-bold underline text-amber-800">KVKK Aydınlatma Metni</a>'ni okudum.
              </span>
            </label>
          )}

          {mode === 'REGISTER' && (
            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={shareCardConsent}
                onChange={(e) => setShareCardConsent(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-amber-500 shrink-0"
              />
              <span>
                <span className="text-slate-500">(İsteğe bağlı)</span> Maç paylaşım kartlarında kısaltılmış adımın, fotoğrafımın ve Elo puanımın görünmesine{' '}
                <a href="/yasal/acik-riza-metni" target="_blank" rel="noopener" className="font-bold underline text-amber-800">Açık Rıza Metni</a> kapsamında rıza veriyorum.
                Vermezsem kartlarda anonim görünürüm; üyeliğim etkilenmez.
              </span>
            </label>
          )}

          <button type="submit" disabled={loading} className={primaryButtonClass}>
            <span>{submitLabel}</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </form>

        {mode === 'FORGOT' && (
          <p className="text-center">
            <button type="button" onClick={() => switchMode('LOGIN')} className={linkButtonClass}>
              Giriş ekranına dön
            </button>
          </p>
        )}
      </div>

      <div className="text-center mt-6 text-xs text-slate-500 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-4 h-4 text-amber-600" aria-hidden="true" />
        <span>256-bit SSL Güvenli Bağlantı • KVKK Uyumludur</span>
      </div>

    </div>
  );
};
