import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { ArrowLeft, ShieldAlert, AlertTriangle, LogOut, FileText } from 'lucide-react';

const LEGAL_LINKS = [
  { slug: 'kullanim-kosullari', title: 'Kullanım Koşulları' },
  { slug: 'kvkk-aydinlatma-metni', title: 'KVKK Aydınlatma Metni' },
  { slug: 'acik-riza-metni', title: 'Açık Rıza Metni' }
];
import { ThemeToggle } from '../common/ThemeToggle.js';

export const AccountPrivacyView: React.FC = () => {
  const { user, logout, navigate } = useAuth();
  
  const [confirmCheck, setConfirmCheck] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canDelete = confirmCheck && confirmText === 'HESABIMI SIL';

  const [shareCard, setShareCard] = useState<{ granted: boolean; at: string | null } | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentMessage, setConsentMessage] = useState<string | null>(null);

  useEffect(() => {
    api.getConsents().then(res => setShareCard(res.consents.share_card)).catch(() => setShareCard(null));
  }, []);

  const toggleShareCard = async () => {
    if (!shareCard) return;
    setConsentBusy(true);
    setConsentMessage(null);
    try {
      const res = await api.setShareCardConsent(!shareCard.granted);
      setShareCard({ granted: !shareCard.granted, at: new Date().toISOString() });
      setConsentMessage(res.message);
    } catch (err: any) {
      setConsentMessage(err.message || 'Tercihiniz kaydedilemedi.');
    } finally {
      setConsentBusy(false);
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canDelete || loading) return;

    setLoading(true);
    setDeleteError(null);
    try {
      await api.deleteAccount(confirmText, confirmCheck);
      logout();
    } catch (err: any) {
      setDeleteError(err.message || 'Hesap silinirken bir hata oluştu.');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* Back */}
      <button
        type="button"
        onClick={() => navigate('/profil')}
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>Profile Dön</span>
      </button>

      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight font-serif">
          Hesap ve Gizlilik Ayarları
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Görünüm teması, gizlilik tercihleriniz ve hesap durumunuzu yönetin
        </p>
      </div>

      {/* Night-match Theme Mode */}
      <ThemeToggle variant="card" />

      {/* Privacy Overview */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <span>Oyuncu Gizliliği & Maskeleme (KVKK Uyumu)</span>
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          RALO, oyuncuların gizliliğini korumak amacıyla açık maç listelerinde ve arama sonuçlarında adınızı otomatik olarak maskeler (Örn: <strong className="text-slate-900 dark:text-slate-200">{user?.maskedName}</strong>). Telefon numaranız hiçbir zaman diğer oyuncularla paylaşılmaz; yalnızca tesis işletmecisi acil durum teyidi için görüntüleyebilir.
        </p>
      </div>

      {/* Consents and legal documents */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <span>Rızalar ve Yasal Metinler</span>
        </h2>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
          <div className="text-xs text-slate-700 dark:text-slate-300">
            <p className="font-bold text-slate-900 dark:text-white">Paylaşım kartlarında görünme</p>
            <p className="mt-0.5">
              Açık maç paylaşım kartlarında kısaltılmış adınız, fotoğrafınız ve Elo puanınız görünsün mü? Vermezseniz kartta anonim görünürsünüz.
            </p>
            {shareCard?.at && (
              <p className="mt-1 text-[11px] text-slate-500">
                Son tercih: {shareCard.granted ? 'Rıza verildi' : 'Rıza verilmedi / geri alındı'} · {new Date(shareCard.at).toLocaleString('tr-TR')}
              </p>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!shareCard?.granted}
            disabled={!shareCard || consentBusy}
            onClick={toggleShareCard}
            className={`shrink-0 min-h-[44px] px-4 rounded-xl text-xs font-black cursor-pointer disabled:opacity-50 ${
              shareCard?.granted ? 'bg-amber-500 text-slate-950' : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200'
            }`}
          >
            {shareCard?.granted ? 'Rızayı Geri Al' : 'Rıza Ver'}
          </button>
        </div>
        {consentMessage && <p role="status" className="text-xs font-semibold text-amber-800 dark:text-amber-300">{consentMessage}</p>}
        <ul className="flex flex-wrap gap-2">
          {LEGAL_LINKS.map(link => (
            <li key={link.slug}>
              <button
                type="button"
                onClick={() => navigate(`/yasal/${link.slug}`)}
                className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                {link.title}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Logout Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between transition-colors">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Oturumu Kapat</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Bu cihazdaki oturumunuzu güvenli bir şekilde sonlandırın.</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Çıkış Yap</span>
        </button>
      </div>

      {/* 2-Step Account Deletion */}
      <div className="bg-red-50/60 dark:bg-red-950/30 rounded-3xl p-6 border border-red-200 dark:border-red-900/60 shadow-xs space-y-4 transition-colors">
        <div>
          <h2 className="text-base font-bold text-red-950 dark:text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-700 dark:text-red-400" />
            <span>Hesabı Kalıcı Olarak Sil</span>
          </h2>
          <p className="text-xs text-red-800 dark:text-red-300/90 mt-1 leading-relaxed">
            Hesabınızı sildiğinizde; profiliniz, puanlarınız (Elo), maç geçmişiniz ve rezervasyon kayıtlarınız kalıcı olarak kaldırılır. Bu işlem geri alınamaz.
          </p>
        </div>

        {deleteError && (
          <div className="p-3 bg-red-100 dark:bg-red-900/60 border border-red-300 dark:border-red-800 rounded-xl text-xs text-red-900 dark:text-red-200" role="alert">
            {deleteError}
          </div>
        )}

        <form onSubmit={handleDelete} className="space-y-4 pt-2">
          
          {/* Step 1: Checkbox */}
          <label className="flex items-start gap-2.5 cursor-pointer text-xs font-semibold text-slate-800 dark:text-slate-200">
            <input
              type="checkbox"
              checked={confirmCheck}
              onChange={(e) => setConfirmCheck(e.target.checked)}
              className="mt-0.5 rounded text-red-600 focus:ring-red-600 h-4 w-4 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
            />
            <span>Hesabımın ve maç geçmişimin kalıcı olarak silineceğini anlıyor ve onaylıyorum.</span>
          </label>

          {/* Step 2: Confirm text input */}
          <div>
            <label htmlFor="delete-confirm-text" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Onaylamak için büyük harflerle <span className="font-mono text-red-700 dark:text-red-400">HESABIMI SIL</span> yazınız:
            </label>
            <input
              id="delete-confirm-text"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="HESABIMI SIL"
              className="w-full sm:w-80 min-h-[44px] px-3.5 py-2 rounded-xl border border-red-300 dark:border-red-800 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 bg-white dark:bg-slate-800"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={!canDelete || loading}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-red-600 shadow-xs cursor-pointer"
            >
              {loading ? 'Siliniyor...' : 'Hesabımı Kalıcı Olarak Sil'}
            </button>
          </div>
        </form>
      </div>

    </div>
  );
};
