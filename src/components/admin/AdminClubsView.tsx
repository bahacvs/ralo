import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import { Modal } from '../common/Modal.js';
import type { AdminClubListItem, AdminReference } from '../../types/admin.js';
import { PageHeader, Alert, inputClass, labelClass, primaryButton, secondaryButton, cardClass } from './adminUi.js';
import { Plus, ChevronRight, MailWarning } from 'lucide-react';

const EMPTY_FORM = {
  name: '',
  cityId: '35',
  districtName: '',
  address: '',
  phone: '',
  ownerName: '',
  ownerEmail: '',
  cancellationWindowHours: '24',
  amenities: [] as string[]
};

export const AdminClubsView: React.FC = () => {
  const { navigate } = useAuth();
  const [clubs, setClubs] = useState<AdminClubListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<AdminReference | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError(null);
    try {
      setClubs((await api.admin.clubs()).clubs);
    } catch (err: any) {
      setError(err.message || 'Kulüpler yüklenemedi.');
    }
  };

  useEffect(() => {
    load();
    api.admin.reference().then(setReference).catch(() => setReference(null));
  }, []);

  const update = (field: keyof typeof EMPTY_FORM, value: string) => setForm(prev => ({ ...prev, [field]: value }));
  const toggleAmenity = (code: string) =>
    setForm(prev => ({ ...prev, amenities: prev.amenities.includes(code) ? prev.amenities.filter(a => a !== code) : [...prev.amenities, code] }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await api.admin.createClub({
        name: form.name,
        cityId: Number(form.cityId),
        districtName: form.districtName,
        address: form.address,
        phone: form.phone || undefined,
        ownerName: form.ownerName,
        ownerEmail: form.ownerEmail,
        cancellationWindowHours: Number(form.cancellationWindowHours),
        amenities: form.amenities,
        isActive: false
      });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      navigate(`/admin/kulupler/${res.club.id}`);
    } catch (err: any) {
      setFormError(err.message || 'Kulüp oluşturulamadı.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Kulüpler"
        description="Kulüpleri RALO ekibi ekler; kulüp sahibine panel davet e-postası gider."
        actions={
          <button type="button" className={primaryButton} onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Yeni Kulüp</span>
          </button>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !clubs ? (
        <LoadingState message="Kulüpler yükleniyor..." />
      ) : clubs.length === 0 ? (
        <Alert tone="info">Henüz kulüp yok. "Yeni Kulüp" ile ilk kulübü ekleyin.</Alert>
      ) : (
        <ul className={`${cardClass} divide-y divide-slate-100 overflow-hidden`}>
          {clubs.map(club => (
            <li key={club.id}>
              <button
                type="button"
                onClick={() => navigate(`/admin/kulupler/${club.id}`)}
                className="w-full text-left p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-slate-50 focus-visible:bg-slate-50 cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-black text-slate-900">{club.name}</h2>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${club.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                      {club.isActive ? 'Yayında' : 'Pasif'}
                    </span>
                    {club.isActive && !club.appBookingEnabled && (
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${club.bookingSuspendedForPayment ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>
                        {club.bookingSuspendedForPayment ? 'Ödeme gecikmesi: rezervasyon durduruldu' : 'Uygulama rezervasyonu kapalı'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">{club.district} / {club.city} · {club.activeCourtCount} aktif kort ({club.courtCount} toplam)</p>
                </div>
                <div className="text-xs text-slate-600 sm:text-right min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{club.ownerName ?? 'Sahip atanmadı'}</p>
                  <p className="truncate">{club.ownerEmail}</p>
                  {club.ownerEmail && !club.ownerHasPassword && (
                    <p className="inline-flex items-center gap-1 text-amber-700 font-semibold mt-0.5">
                      <MailWarning className="w-3.5 h-3.5" aria-hidden="true" /> Davet bekliyor
                    </p>
                  )}
                </div>
                <ChevronRight className="hidden sm:block w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Yeni Kulüp"
        description="Kulüp pasif olarak oluşturulur. Kortları ve saatleri ekledikten sonra yayına alın."
        maxWidth="lg"
      >
        <form onSubmit={handleCreate} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}

          <div>
            <label htmlFor="club-name" className={labelClass}>Kulüp adı</label>
            <input id="club-name" className={inputClass} value={form.name} maxLength={120} onChange={e => update('name', e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="club-city" className={labelClass}>İl</label>
              <select id="club-city" className={inputClass} value={form.cityId} onChange={e => update('cityId', e.target.value)}>
                {(reference?.cities ?? [{ id: 35, name: 'İzmir' }]).map(city => (
                  <option key={city.id} value={city.id}>{city.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="club-district" className={labelClass}>İlçe</label>
              <input id="club-district" className={inputClass} value={form.districtName} maxLength={60} onChange={e => update('districtName', e.target.value)} />
            </div>
          </div>

          <div>
            <label htmlFor="club-address" className={labelClass}>Adres</label>
            <input id="club-address" className={inputClass} value={form.address} maxLength={300} onChange={e => update('address', e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="club-phone" className={labelClass}>Telefon (isteğe bağlı)</label>
              <input id="club-phone" type="tel" className={inputClass} placeholder="0232 000 00 00" value={form.phone} onChange={e => update('phone', e.target.value)} />
            </div>
            <div>
              <label htmlFor="club-window" className={labelClass}>Oyuncu iptal süresi (saat)</label>
              <input id="club-window" type="number" min={0} max={168} className={inputClass} value={form.cancellationWindowHours} onChange={e => update('cancellationWindowHours', e.target.value)} />
            </div>
          </div>

          <fieldset className="p-3 rounded-2xl bg-slate-50 space-y-3">
            <legend className="text-xs font-black text-slate-800 px-1">İşletme sahibi</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="owner-name" className={labelClass}>Ad soyad</label>
                <input id="owner-name" className={inputClass} value={form.ownerName} maxLength={60} onChange={e => update('ownerName', e.target.value)} />
              </div>
              <div>
                <label htmlFor="owner-email" className={labelClass}>E-posta</label>
                <input id="owner-email" type="email" className={inputClass} value={form.ownerEmail} onChange={e => update('ownerEmail', e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-slate-600">Hesabı yoksa şifre belirleme bağlantısı gönderilir (7 gün geçerli). Başka bir kulüpte kayıtlı e-posta kullanılamaz.</p>
          </fieldset>

          {reference && (
            <fieldset>
              <legend className={labelClass}>Olanaklar</legend>
              <div className="grid grid-cols-2 gap-2">
                {reference.amenities.map(a => (
                  <label key={a.code} className="flex items-center gap-2 text-xs font-semibold text-slate-800 min-h-[32px] cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-amber-500" checked={form.amenities.includes(a.code)} onChange={() => toggleAmenity(a.code)} />
                    <span>{a.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button type="button" className={secondaryButton} onClick={() => setShowCreate(false)}>Vazgeç</button>
            <button type="submit" className={primaryButton} disabled={saving}>{saving ? 'Oluşturuluyor...' : 'Kulübü Oluştur'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
