import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import { Modal } from '../common/Modal.js';
import { Plus, Shield, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import type { StaffMembership } from '../../types/index.js';

// Owners keep court, staff and report management; these are the permissions staff can hold.
const PERMISSION_OPTIONS = [
  { value: 'RESERVATION_MANAGE', label: 'Rezervasyon yönetimi' },
  { value: 'PAYMENT_COLLECT', label: 'Tahsilat kaydı' },
  { value: 'COURT_BLOCK', label: 'Kort kapatma (bakım, etkinlik)' }
];

export const PanelStaffView: React.FC = () => {
  const { user } = useAuth();
  const businessId = user?.businessId || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<StaffMembership[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState<string[]>(['RESERVATION_MANAGE', 'PAYMENT_COLLECT']);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPanelStaff(businessId);
      setStaffList(res.staff);
    } catch (err: any) {
      setError(err.message || 'Personel listesi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [businessId]);

  const togglePermission = (value: string) => {
    setPermissions(prev => prev.includes(value) ? prev.filter(p => p !== value) : [...prev, value]);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setFormError(null);
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
      setFormError('Personelin adını ve geçerli bir e-posta adresini giriniz.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await api.createPanelStaff({ name: trimmedName, email: trimmedEmail, permissions });
      if (!res.invited) {
        setNotice(`${trimmedName} eklendi. Mevcut RALO hesabıyla giriş yaparak panele ulaşabilir.`);
      } else if (res.inviteEmailSent) {
        setNotice(`${trimmedName} eklendi. Şifre belirleme bağlantısı ${trimmedEmail} adresine gönderildi (7 gün geçerli).`);
      } else {
        setNotice(`${trimmedName} eklendi ancak davet e-postası gönderilemedi. Personel giriş ekranındaki "Şifremi unuttum" ile şifre belirleyebilir.`);
      }
      setShowAddModal(false);
      setName('');
      setEmail('');
      await fetchStaff();
    } catch (err: any) {
      setFormError(err.message || 'Personel eklenemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-serif">
            Personel & Yetkilendirme
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Tesis personellerini ve yetki sınırlarını yönetin
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors shadow-xs focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <Plus className="w-4 h-4" />
          <span>Personel Yetkilendir</span>
        </button>
      </div>

      {notice && (
        <div role="status" className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span className="font-semibold">{notice}</span>
        </div>
      )}

      {loading ? (
        <LoadingState message="Personel listesi getiriliyor..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchStaff} />
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="divide-y divide-slate-100">
            {staffList.map((member) => {
              const displayName = member.userName || 'Personel';
              const isOwner = member.role === 'ISLETME_SAHIBI';
              return (
                <div key={member.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-800 flex items-center justify-center font-bold shrink-0">
                      {displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-slate-900">{displayName}</h2>
                      {member.userEmail && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 min-w-0">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" aria-hidden="true" />
                          <span className="truncate">{member.userEmail}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                      isOwner ? 'bg-amber-100 text-amber-900' : 'bg-amber-50 text-amber-900 border border-amber-200'
                    }`}>
                      {isOwner ? 'İşletme Sahibi' : 'Personel'}
                    </span>

                    <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg">
                      <Shield className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                      <span>{isOwner ? 'Tam yetki' : `${member.permissions.length} yetki tanımlı`}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={closeModal}
        title="Yeni Personel Ekle"
        description="Personel e-posta adresine gelen bağlantıyla şifresini belirleyip panele giriş yapar."
        maxWidth="md"
      >
        <form onSubmit={handleAddStaff} className="space-y-4" noValidate>
          {formError && (
            <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" aria-hidden="true" />
              <span className="font-semibold">{formError}</span>
            </div>
          )}

          <div>
            <label htmlFor="staff-name" className="block text-xs font-bold text-slate-700 mb-1">Personel Adı Soyadı</label>
            <input
              id="staff-name"
              type="text"
              placeholder="Örn: Ece Çetin"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold"
            />
          </div>

          <div>
            <label htmlFor="staff-email" className="block text-xs font-bold text-slate-700 mb-1">E-posta Adresi</label>
            <input
              id="staff-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="ece@ornek.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold"
            />
          </div>

          <fieldset>
            <legend className="block text-xs font-bold text-slate-700 mb-1.5">Yetkiler</legend>
            <div className="space-y-2">
              {PERMISSION_OPTIONS.map(option => (
                <label key={option.value} className="flex items-center gap-2.5 min-h-[36px] text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissions.includes(option.value)}
                    onChange={() => togglePermission(option.value)}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">Kort, personel ve rapor yönetimi yalnızca işletme sahibindedir.</p>
          </fieldset>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-slate-600"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black transition-colors"
            >
              {submitting ? 'Ekleniyor...' : 'Yetkilendir'}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
};
