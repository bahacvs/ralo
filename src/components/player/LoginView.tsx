import React, { useState, useRef } from 'react';
import { useAuth, isValidInternalPath } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { Phone, KeyRound, ArrowRight, ShieldCheck, AlertCircle, Copy, Check } from 'lucide-react';
import { RaloIcon } from '../common/RaloLogo.js';

export const LoginView: React.FC = () => {
  const { loginWithOtp, navigate } = useAuth();

  const [phone, setPhone] = useState('0532 100 2030');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const phoneRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setError('Lütfen geçerli bir telefon numarası giriniz.');
      phoneRef.current?.focus();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.sendOtp(phone);
      if (res.demoOtp) {
        setDemoCode(res.demoOtp);
      }
      setStep('OTP');
      setTimeout(() => {
        codeRef.current?.focus();
      }, 100);
    } catch (err: any) {
      setError(err.message || 'SMS kodu gönderilemedi. Lütfen tekrar deneyiniz.');
      phoneRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length !== 6) {
      setError('Lütfen 6 haneli doğrulama kodunu eksiksiz giriniz.');
      codeRef.current?.focus();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await loginWithOtp(phone, code);
      // loginWithOtp will handle redirection to returnTo or /ana
    } catch (err: any) {
      setError(err.message || 'Hatalı kod veya oturum açılamadı.');
      codeRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const copyDemoCode = () => {
    if (demoCode) {
      setCode(demoCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      codeRef.current?.focus();
    }
  };

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
        <p className="text-xs text-slate-500 mt-1">
          SMS doğrulama kodu ile şifresiz ve anında oturum açın
        </p>
      </div>

      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm space-y-5">
        
        {/* Error Alert */}
        {error && (
          <div 
            role="alert" 
            aria-live="assertive"
            className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" aria-hidden="true" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {step === 'PHONE' ? (
          <form onSubmit={handleSendOtp} className="space-y-4" noValidate>
            <div>
              <label htmlFor="auth-phone" className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                <span>Cep Telefonu Numaranız</span>
              </label>
              <input
                ref={phoneRef}
                id="auth-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0532 100 2030"
                autoComplete="tel"
                aria-describedby="phone-hint"
                aria-invalid={!!error}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p id="phone-hint" className="text-[11px] text-slate-500 mt-1">
                Giriş yapmanız için 6 haneli tek kullanımlık SMS kodu göndereceğiz.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black transition-colors flex items-center justify-center gap-2 shadow-xs focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
            >
              <span>{loading ? 'Kod Gönderiliyor...' : 'Doğrulama Kodu Gönder'}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4" noValidate>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="auth-otp" className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                  <span>6 Haneli SMS Kodu</span>
                </label>
                <button
                  type="button"
                  onClick={() => setStep('PHONE')}
                  className="text-xs text-amber-700 hover:text-amber-800 font-semibold cursor-pointer"
                >
                  Numarayı Değiştir
                </button>
              </div>

              <input
                ref={codeRef}
                id="auth-otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                autoComplete="one-time-code"
                aria-describedby="otp-hint"
                aria-invalid={!!error}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 text-center tracking-widest text-lg font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p id="otp-hint" className="text-[11px] text-slate-500 mt-1">
                <strong>{phone}</strong> numarasına gönderilen 6 haneli kodu giriniz.
              </p>
            </div>

            {/* Demo Helper Box */}
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs flex items-center justify-between">
              <div>
                <span className="font-bold text-amber-950 block">Demo Geliştirici Kodu:</span>
                <span className="font-mono text-amber-900 text-sm font-extrabold">{demoCode || '123456'}</span>
              </div>
              <button
                type="button"
                onClick={copyDemoCode}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 text-xs font-bold shadow-2xs hover:bg-amber-100 transition-colors min-h-[38px] cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-amber-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Dolduruldu' : 'Kodu Doldur'}</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black transition-colors flex items-center justify-center gap-2 shadow-xs focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
            >
              <span>{loading ? 'Doğrulanıyor...' : 'Girişi Tamamla'}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        )}

      </div>

      <div className="text-center mt-6 text-xs text-slate-500 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-4 h-4 text-amber-600" aria-hidden="true" />
        <span>256-bit SSL Güvenli Bağlantı • KVKK Uyumludur</span>
      </div>

    </div>
  );
};
