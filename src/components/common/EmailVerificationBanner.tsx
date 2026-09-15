import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { MailWarning } from 'lucide-react';

/** Reminds signed-in players to verify their email; app reservations require it. */
export const EmailVerificationBanner: React.FC = () => {
  const { user, currentRoute, refreshUser } = useAuth();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!user || user.emailVerified || !user.email || currentRoute === '/eposta-dogrula') {
    return null;
  }

  const resend = async () => {
    setSending(true);
    try {
      const res = await api.resendVerification();
      setMessage(res.message);
      if (res.alreadyVerified) void refreshUser();
    } catch (err: any) {
      setMessage(err.message || 'Bağlantı gönderilemedi. Lütfen biraz sonra tekrar deneyin.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 text-amber-950 dark:text-amber-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs">
        <p className="flex items-start gap-2 flex-1 min-w-0">
          <MailWarning className="w-4 h-4 shrink-0 mt-px text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <span>
            <strong>E-posta adresinizi doğrulayın.</strong>{' '}
            Rezervasyon yapabilmek için <span className="font-semibold break-all">{user.email}</span> adresine gönderdiğimiz bağlantıya tıklayın.
          </span>
        </p>
        {message ? (
          <p role="status" className="font-semibold sm:max-w-xs">{message}</p>
        ) : (
          <button
            type="button"
            onClick={resend}
            disabled={sending}
            className="self-start sm:self-auto min-h-[36px] px-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-amber-950 font-bold hover:bg-amber-100 dark:hover:bg-amber-900 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {sending ? 'Gönderiliyor...' : 'Bağlantıyı tekrar gönder'}
          </button>
        )}
      </div>
    </div>
  );
};
