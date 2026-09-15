import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import type { AdminClubDetail, AdminReference, LessonFeeBasis } from '../../types/admin.js';
import type { Court, CourtType } from '../../types/index.js';
import {
  PageHeader, Alert, inputClass, labelClass, primaryButton, secondaryButton, cardClass,
  COURT_TYPE_LABELS, LESSON_BASIS_LABELS, formatTl, minutesToClock
} from './adminUi.js';
import { ArrowLeft, Plus } from 'lucide-react';

const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

type Feedback = { tone: 'success' | 'error'; text: string } | null;

const Section: React.FC<{ title: string; description?: string; feedback?: Feedback; children: React.ReactNode }> = ({ title, description, feedback, children }) => (
  <section className={`${cardClass} p-5 space-y-4`} aria-label={title}>
    <div>
      <h2 className="text-sm font-black text-slate-900">{title}</h2>
      {description && <p className="text-xs text-slate-600 mt-0.5">{description}</p>}
    </div>
    {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}
    {children}
  </section>
);

export const AdminClubDetailView: React.FC = () => {
  const { currentRoute, navigate } = useAuth();
  const clubId = currentRoute.split('/')[3] ?? '';

  const [club, setClub] = useState<AdminClubDetail | null>(null);
  const [reference, setReference] = useState<AdminReference | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [statusFeedback, setStatusFeedback] = useState<Feedback>(null);
  const [infoFeedback, setInfoFeedback] = useState<Feedback>(null);
  const [hoursFeedback, setHoursFeedback] = useState<Feedback>(null);
  const [courtFeedback, setCourtFeedback] = useState<Feedback>(null);
  const [feeFeedback, setFeeFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [info, setInfo] = useState({
    name: '', cityId: '', districtName: '', address: '', phone: '', latitude: '', longitude: '',
    cancellationWindowHours: '', coverImageUrl: '', policies: '', amenities: [] as string[]
  });
  const [hours, setHours] = useState(WEEKDAYS.map(() => ({ isClosed: false, open: '08:00', close: '23:00' })));
  const [newCourt, setNewCourt] = useState({ name: '', type: 'OUTDOOR_PANORAMIC' as CourtType, surface: 'Suni çim', pricePerHour: '' });
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [lessonFee, setLessonFee] = useState({ amount: '', basis: 'per_session' as LessonFeeBasis });

  const applyClub = (data: AdminClubDetail) => {
    setClub(data);
    setInfo({
      name: data.name,
      cityId: String(data.cityId),
      districtName: data.district,
      address: data.business.address,
      phone: data.business.phone ? `0${data.business.phone.replace(/^\+90/, '')}` : '',
      latitude: data.business.latitude?.toString() ?? '',
      longitude: data.business.longitude?.toString() ?? '',
      cancellationWindowHours: String(data.business.cancellationWindowHours ?? 24),
      coverImageUrl: data.business.coverImage ?? '',
      policies: data.business.policies.join('\n'),
      amenities: data.amenityCodes
    });
    setHours(WEEKDAYS.map((_, index) => {
      const day = data.openingHours.find(h => h.weekday === index + 1);
      return day
        ? { isClosed: day.isClosed, open: minutesToClock(day.openMinute) || '08:00', close: minutesToClock(day.closeMinute) || '23:00' }
        : { isClosed: false, open: '08:00', close: '23:00' };
    }));
    setPrices(Object.fromEntries(data.courts.map(c => [c.id, String(c.pricePerHour)])));
    if (data.lessonFee) setLessonFee({ amount: String(data.lessonFee.amount), basis: data.lessonFee.basis });
  };

  const load = async () => {
    setError(null);
    try {
      applyClub((await api.admin.club(clubId)).club);
    } catch (err: any) {
      setError(err.message || 'Kulüp yüklenemedi.');
    }
  };

  useEffect(() => {
    load();
    api.admin.reference().then(setReference).catch(() => setReference(null));
  }, [clubId]);

  const run = async (key: string, setFeedback: (f: Feedback) => void, action: () => Promise<void>, success: string) => {
    setBusy(key);
    setFeedback(null);
    try {
      await action();
      setFeedback({ tone: 'success', text: success });
    } catch (err: any) {
      setFeedback({ tone: 'error', text: err.message || 'İşlem tamamlanamadı.' });
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!club) return <LoadingState message="Kulüp yükleniyor..." />;

  const toggleActive = () => {
    if (club.isActive && !window.confirm(`${club.name} yayından kaldırılsın mı? Oyuncular kulübü ve kortlarını göremeyecek.`)) return;
    run('status', setStatusFeedback, async () => {
      applyClub((await api.admin.updateClub(club.id, { isActive: !club.isActive })).club);
    }, club.isActive ? 'Kulüp yayından kaldırıldı.' : 'Kulüp yayına alındı.');
  };

  const toggleBooking = () =>
    run('status', setStatusFeedback, async () => {
      applyClub((await api.admin.updateClub(club.id, { appBookingEnabled: !club.appBookingEnabled })).club);
    }, club.appBookingEnabled ? 'Uygulama rezervasyonları kapatıldı.' : 'Uygulama rezervasyonları açıldı.');

  const resendInvite = () =>
    run('invite', setStatusFeedback, async () => {
      await api.admin.resendOwnerInvite(club.id);
    }, `Davet bağlantısı ${club.ownerEmail} adresine yeniden gönderildi.`);

  const saveInfo = (e: React.FormEvent) => {
    e.preventDefault();
    run('info', setInfoFeedback, async () => {
      applyClub((await api.admin.updateClub(club.id, {
        name: info.name,
        cityId: Number(info.cityId),
        districtName: info.districtName,
        address: info.address,
        phone: info.phone,
        latitude: info.latitude,
        longitude: info.longitude,
        cancellationWindowHours: Number(info.cancellationWindowHours),
        coverImageUrl: info.coverImageUrl,
        policies: info.policies.split('\n').map(p => p.trim()).filter(Boolean),
        amenities: info.amenities
      })).club);
    }, 'Kulüp bilgileri kaydedildi.');
  };

  const saveHours = (e: React.FormEvent) => {
    e.preventDefault();
    run('hours', setHoursFeedback, async () => {
      applyClub((await api.admin.setOpeningHours(club.id, hours)).club);
    }, 'Çalışma saatleri kaydedildi.');
  };

  const addCourt = (e: React.FormEvent) => {
    e.preventDefault();
    run('court-new', setCourtFeedback, async () => {
      await api.admin.createCourt(club.id, { ...newCourt, pricePerHour: Number(newCourt.pricePerHour) });
      setNewCourt({ name: '', type: 'OUTDOOR_PANORAMIC', surface: 'Suni çim', pricePerHour: '' });
      applyClub((await api.admin.club(club.id)).club);
    }, 'Kort eklendi.');
  };

  const updateCourt = (court: Court, data: Record<string, unknown>, message: string) =>
    run(`court-${court.id}`, setCourtFeedback, async () => {
      await api.admin.updateCourt(club.id, court.id, data);
      applyClub((await api.admin.club(club.id)).club);
    }, message);

  const saveLessonFee = (e: React.FormEvent) => {
    e.preventDefault();
    run('fee', setFeeFeedback, async () => {
      applyClub((await api.admin.setLessonFee(club.id, Number(lessonFee.amount), lessonFee.basis)).club);
    }, 'Ders ücreti kaydedildi. Yeni dersler bu ücretle oluşturulur.');
  };

  const activeCourts = club.courts.filter(c => c.isActive).length;

  return (
    <div className="space-y-5 pb-12">
      <button type="button" onClick={() => navigate('/admin/kulupler')} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Kulüpler
      </button>

      <PageHeader title={club.name} description={`${club.district} / ${club.city}`} />

      <Section title="Yayın durumu" feedback={statusFeedback}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-2xl bg-slate-50 space-y-2">
            <p className="text-xs text-slate-700">
              Durum: <strong className={club.isActive ? 'text-emerald-700' : 'text-slate-900'}>{club.isActive ? 'Yayında' : 'Pasif (oyunculara görünmüyor)'}</strong>
            </p>
            {!club.isActive && activeCourts === 0 && (
              <p className="text-[11px] text-amber-800">Yayına almadan önce en az bir aktif kort ekleyin.</p>
            )}
            <button type="button" className={club.isActive ? secondaryButton : primaryButton} onClick={toggleActive} disabled={busy === 'status'}>
              {club.isActive ? 'Yayından Kaldır' : 'Yayına Al'}
            </button>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 space-y-2">
            <p className="text-xs text-slate-700">
              Uygulama rezervasyonu: <strong>{club.appBookingEnabled ? 'Açık' : 'Kapalı'}</strong>
            </p>
            <p className="text-[11px] text-slate-600">Kapalıyken kulüp görünür ama oyuncular uygulamadan kort ayıramaz; panelden giriş devam eder.</p>
            <button type="button" className={secondaryButton} onClick={toggleBooking} disabled={busy === 'status'}>
              {club.appBookingEnabled ? 'Rezervasyonları Kapat' : 'Rezervasyonları Aç'}
            </button>
          </div>
        </div>
        <div className="p-3 rounded-2xl bg-slate-50 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
          <div className="text-xs text-slate-700 min-w-0">
            <p>İşletme sahibi: <strong>{club.ownerName ?? '—'}</strong> <span className="break-all">({club.ownerEmail ?? '—'})</span></p>
            <p className="text-[11px] mt-0.5">{club.ownerHasPassword ? 'Hesabı aktif, panele giriş yapabilir.' : 'Şifre belirlemedi, davet bekliyor.'}</p>
          </div>
          {club.ownerEmail && !club.ownerHasPassword && (
            <button type="button" className={secondaryButton} onClick={resendInvite} disabled={busy === 'invite'}>Daveti Tekrar Gönder</button>
          )}
        </div>
      </Section>

      <Section title="Kortlar" description="Fiyatlar saatlik ve TL cinsindendir. Oyuncu fiyatı süreye göre hesaplanır." feedback={courtFeedback}>
        {club.courts.length === 0 ? (
          <Alert tone="info">Henüz kort yok.</Alert>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden">
            {club.courts.map(court => (
              <li key={court.id} className="p-3 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{court.name}</p>
                  <p className="text-xs text-slate-600">{COURT_TYPE_LABELS[court.type]} · {court.surface} · {court.isActive ? 'Aktif' : 'Kapalı'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={`price-${court.id}`} className="sr-only">{court.name} saatlik ücret</label>
                  <input
                    id={`price-${court.id}`}
                    type="number"
                    min={1}
                    className={`${inputClass} w-28`}
                    value={prices[court.id] ?? ''}
                    onChange={e => setPrices(prev => ({ ...prev, [court.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={busy === `court-${court.id}` || Number(prices[court.id]) === court.pricePerHour}
                    onClick={() => updateCourt(court, { pricePerHour: Number(prices[court.id]) }, `${court.name} fiyatı ${formatTl(Number(prices[court.id]))} olarak güncellendi.`)}
                  >
                    Fiyatı Kaydet
                  </button>
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={busy === `court-${court.id}`}
                    onClick={() => updateCourt(court, { isActive: !court.isActive }, court.isActive ? `${court.name} kapatıldı.` : `${court.name} açıldı.`)}
                  >
                    {court.isActive ? 'Kortu Kapat' : 'Kortu Aç'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addCourt} className="p-3 rounded-2xl bg-slate-50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end" noValidate>
          <div className="lg:col-span-2">
            <label htmlFor="court-name" className={labelClass}>Yeni kort adı</label>
            <input id="court-name" className={inputClass} value={newCourt.name} maxLength={60} onChange={e => setNewCourt(prev => ({ ...prev, name: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="court-type" className={labelClass}>Tip</label>
            <select id="court-type" className={inputClass} value={newCourt.type} onChange={e => setNewCourt(prev => ({ ...prev, type: e.target.value as CourtType }))}>
              {(Object.keys(COURT_TYPE_LABELS) as CourtType[]).map(type => <option key={type} value={type}>{COURT_TYPE_LABELS[type]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="court-price" className={labelClass}>Saatlik ücret (TL)</label>
            <input id="court-price" type="number" min={1} className={inputClass} value={newCourt.pricePerHour} onChange={e => setNewCourt(prev => ({ ...prev, pricePerHour: e.target.value }))} />
          </div>
          <button type="submit" className={primaryButton} disabled={busy === 'court-new'}>
            <Plus className="w-4 h-4" aria-hidden="true" /> Kort Ekle
          </button>
        </form>
      </Section>

      <Section title="Çalışma saatleri" description="Kapanış açılıştan önceyse kulüp gece yarısından sonra kapanıyor sayılır." feedback={hoursFeedback}>
        <form onSubmit={saveHours} className="space-y-2" noValidate>
          {WEEKDAYS.map((day, index) => (
            <div key={day} className="grid grid-cols-[6.5rem_1fr] sm:grid-cols-[8rem_7rem_1fr_1fr] items-center gap-2">
              <span className="text-xs font-bold text-slate-800">{day}</span>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-amber-500"
                  checked={hours[index].isClosed}
                  onChange={e => setHours(prev => prev.map((h, i) => i === index ? { ...h, isClosed: e.target.checked } : h))}
                />
                Kapalı
              </label>
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor={`open-${index}`} className="sr-only">{day} açılış</label>
                <input id={`open-${index}`} type="time" className={inputClass} disabled={hours[index].isClosed} value={hours[index].open}
                  onChange={e => setHours(prev => prev.map((h, i) => i === index ? { ...h, open: e.target.value } : h))} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor={`close-${index}`} className="sr-only">{day} kapanış</label>
                <input id={`close-${index}`} type="time" className={inputClass} disabled={hours[index].isClosed} value={hours[index].close}
                  onChange={e => setHours(prev => prev.map((h, i) => i === index ? { ...h, close: e.target.value } : h))} />
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <button type="submit" className={primaryButton} disabled={busy === 'hours'}>Saatleri Kaydet</button>
          </div>
        </form>
      </Section>

      <Section title="Kulüp bilgileri" feedback={infoFeedback}>
        <form onSubmit={saveInfo} className="space-y-3" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="info-name" className={labelClass}>Kulüp adı</label>
              <input id="info-name" className={inputClass} value={info.name} onChange={e => setInfo(prev => ({ ...prev, name: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="info-phone" className={labelClass}>Telefon</label>
              <input id="info-phone" type="tel" className={inputClass} value={info.phone} onChange={e => setInfo(prev => ({ ...prev, phone: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="info-city" className={labelClass}>İl</label>
              <select id="info-city" className={inputClass} value={info.cityId} onChange={e => setInfo(prev => ({ ...prev, cityId: e.target.value }))}>
                {(reference?.cities ?? [{ id: club.cityId, name: club.city }]).map(city => <option key={city.id} value={city.id}>{city.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="info-district" className={labelClass}>İlçe</label>
              <input id="info-district" className={inputClass} value={info.districtName} onChange={e => setInfo(prev => ({ ...prev, districtName: e.target.value }))} />
            </div>
          </div>
          <div>
            <label htmlFor="info-address" className={labelClass}>Adres</label>
            <input id="info-address" className={inputClass} value={info.address} onChange={e => setInfo(prev => ({ ...prev, address: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="info-lat" className={labelClass}>Enlem</label>
              <input id="info-lat" inputMode="decimal" className={inputClass} placeholder="38.4237" value={info.latitude} onChange={e => setInfo(prev => ({ ...prev, latitude: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="info-lng" className={labelClass}>Boylam</label>
              <input id="info-lng" inputMode="decimal" className={inputClass} placeholder="27.1428" value={info.longitude} onChange={e => setInfo(prev => ({ ...prev, longitude: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="info-window" className={labelClass}>İptal süresi (saat)</label>
              <input id="info-window" type="number" min={0} max={168} className={inputClass} value={info.cancellationWindowHours} onChange={e => setInfo(prev => ({ ...prev, cancellationWindowHours: e.target.value }))} />
            </div>
          </div>
          <div>
            <label htmlFor="info-cover" className={labelClass}>Kapak görseli bağlantısı (https)</label>
            <input id="info-cover" type="url" className={inputClass} value={info.coverImageUrl} onChange={e => setInfo(prev => ({ ...prev, coverImageUrl: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="info-policies" className={labelClass}>Kulüp kuralları (her satır bir madde)</label>
            <textarea id="info-policies" rows={3} className={`${inputClass} py-2`} value={info.policies} onChange={e => setInfo(prev => ({ ...prev, policies: e.target.value }))} />
          </div>
          {reference && (
            <fieldset>
              <legend className={labelClass}>Olanaklar</legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {reference.amenities.map(a => (
                  <label key={a.code} className="flex items-center gap-2 text-xs font-semibold text-slate-800 min-h-[32px] cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-amber-500"
                      checked={info.amenities.includes(a.code)}
                      onChange={() => setInfo(prev => ({
                        ...prev,
                        amenities: prev.amenities.includes(a.code) ? prev.amenities.filter(x => x !== a.code) : [...prev.amenities, a.code]
                      }))}
                    />
                    <span>{a.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="flex justify-end">
            <button type="submit" className={primaryButton} disabled={busy === 'info'}>Bilgileri Kaydet</button>
          </div>
        </form>
      </Section>

      <Section title="Ders platform ücreti" description="Bu kulüpte hocaların açtığı dersler için alınacak ücret. Ücret tanımlanmadan ders oluşturulamaz." feedback={feeFeedback}>
        <form onSubmit={saveLessonFee} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end" noValidate>
          <div>
            <label htmlFor="lesson-amount" className={labelClass}>Tutar (TL)</label>
            <input id="lesson-amount" type="number" min={0} className={inputClass} value={lessonFee.amount} onChange={e => setLessonFee(prev => ({ ...prev, amount: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="lesson-basis" className={labelClass}>Hesaplama</label>
            <select id="lesson-basis" className={inputClass} value={lessonFee.basis} onChange={e => setLessonFee(prev => ({ ...prev, basis: e.target.value as LessonFeeBasis }))}>
              {(Object.keys(LESSON_BASIS_LABELS) as LessonFeeBasis[]).map(b => <option key={b} value={b}>{LESSON_BASIS_LABELS[b]}</option>)}
            </select>
          </div>
          <button type="submit" className={primaryButton} disabled={busy === 'fee' || lessonFee.amount === ''}>Ders Ücretini Kaydet</button>
        </form>
        {club.lessonFee && (
          <p className="text-xs text-slate-600">Geçerli: <strong>{formatTl(club.lessonFee.amount)}</strong> · {LESSON_BASIS_LABELS[club.lessonFee.basis]}</p>
        )}
      </Section>
    </div>
  );
};
