import React, { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import type { FeeSettings } from '../../types/admin.js';
import {
  PageHeader, Alert, inputClass, labelClass, primaryButton, cardClass, formatTl, formatDateTime, LESSON_BASIS_LABELS
} from './adminUi.js';

type Feedback = { tone: 'success' | 'error'; text: string } | null;

export const AdminFeesView: React.FC = () => {
  const [settings, setSettings] = useState<FeeSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [feeAmount, setFeeAmount] = useState('100');
  const [feeReason, setFeeReason] = useState('');
  const [feeFeedback, setFeeFeedback] = useState<Feedback>(null);
  const [savingFee, setSavingFee] = useState(false);

  const [policy, setPolicy] = useState({ amountsIncludeVat: null as boolean | null, vatRatePercent: '20', statementDueDays: '15', chargeNoShow: true });
  const [policyFeedback, setPolicyFeedback] = useState<Feedback>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const apply = (data: FeeSettings) => {
    setSettings(data);
    if (data.appReservationFee) setFeeAmount(String(data.appReservationFee.amount));
    if (data.billingPolicy) {
      setPolicy({
        amountsIncludeVat: data.billingPolicy.amountsIncludeVat,
        vatRatePercent: String(data.billingPolicy.vatRatePercent),
        statementDueDays: String(data.billingPolicy.statementDueDays),
        chargeNoShow: data.billingPolicy.chargeNoShow
      });
    }
  };

  const load = async () => {
    setError(null);
    try {
      apply(await api.admin.fees());
    } catch (err: any) {
      setError(err.message || 'Ücret ayarları yüklenemedi.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(feeAmount);
    if (!window.confirm(`Uygulama rezervasyon ücreti ${formatTl(amount)} olarak değiştirilsin mi? Yeni ücret bundan sonraki rezervasyonlara uygulanır.`)) return;
    setSavingFee(true);
    setFeeFeedback(null);
    try {
      apply(await api.admin.setAppReservationFee(amount, feeReason || undefined));
      setFeeReason('');
      setFeeFeedback({ tone: 'success', text: `Yeni ücret ${formatTl(amount)} olarak kaydedildi.` });
    } catch (err: any) {
      setFeeFeedback({ tone: 'error', text: err.message || 'Ücret kaydedilemedi.' });
    } finally {
      setSavingFee(false);
    }
  };

  const savePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (policy.amountsIncludeVat === null) {
      setPolicyFeedback({ tone: 'error', text: 'Ücretlerin KDV dahil mi hariç mi olduğunu seçin.' });
      return;
    }
    setSavingPolicy(true);
    setPolicyFeedback(null);
    try {
      apply(await api.admin.setBillingPolicy({
        amountsIncludeVat: policy.amountsIncludeVat,
        vatRatePercent: Number(policy.vatRatePercent),
        statementDueDays: Number(policy.statementDueDays),
        chargeNoShow: policy.chargeNoShow
      }));
      setPolicyFeedback({ tone: 'success', text: 'Fatura ayarları kaydedildi. Bundan sonra oluşturulan hesap özetlerine uygulanır.' });
    } catch (err: any) {
      setPolicyFeedback({ tone: 'error', text: err.message || 'Ayarlar kaydedilemedi.' });
    } finally {
      setSavingPolicy(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!settings) return <LoadingState message="Ücret ayarları yükleniyor..." />;

  const vatPreview = (() => {
    const amount = Number(feeAmount) || 0;
    const rate = Number(policy.vatRatePercent) || 0;
    if (policy.amountsIncludeVat === null) return null;
    return policy.amountsIncludeVat
      ? `Kulüp rezervasyon başına ${formatTl(amount)} öder (içinde ${formatTl(Math.round((amount * rate / (100 + rate)) * 100) / 100)} KDV).`
      : `Kulüp rezervasyon başına ${formatTl(amount)} + %${rate} KDV = ${formatTl(Math.round(amount * (100 + rate)) / 100)} öder.`;
  })();

  return (
    <div className="space-y-6 pb-12">
      <PageHeader title="Ücretler & KDV" description="Değişiklikler geçmişe dönük uygulanmaz; her kayıt yeni bir sürüm olarak saklanır." />

      <section className={`${cardClass} p-5 space-y-4`} aria-labelledby="fee-title">
        <div>
          <h2 id="fee-title" className="text-sm font-black text-slate-900">Uygulama rezervasyon ücreti</h2>
          <p className="text-xs text-slate-600 mt-0.5">Oyuncunun uygulamadan yaptığı her rezervasyon için kulüpten alınır. Panelden girilen ve iptal edilen rezervasyonlardan alınmaz.</p>
        </div>
        {!settings.appReservationFee && (
          <Alert tone="warning">Ücret tanımlı değil: oyuncular şu an uygulamadan rezervasyon yapamaz.</Alert>
        )}
        {feeFeedback && <Alert tone={feeFeedback.tone}>{feeFeedback.text}</Alert>}
        <form onSubmit={saveFee} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end" noValidate>
          <div>
            <label htmlFor="fee-amount" className={labelClass}>Tutar (TL)</label>
            <input id="fee-amount" type="number" min={0} step="0.01" className={inputClass} value={feeAmount} onChange={e => setFeeAmount(e.target.value)} />
          </div>
          <div>
            <label htmlFor="fee-reason" className={labelClass}>Not (isteğe bağlı)</label>
            <input id="fee-reason" className={inputClass} value={feeReason} maxLength={300} placeholder="Örn: Lansman fiyatı" onChange={e => setFeeReason(e.target.value)} />
          </div>
          <button type="submit" className={primaryButton} disabled={savingFee || feeAmount === ''}>
            {savingFee ? 'Kaydediliyor...' : 'Ücreti Kaydet'}
          </button>
        </form>
        {settings.appReservationFeeHistory.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">Ücret geçmişi</caption>
              <thead>
                <tr className="text-left text-slate-500">
                  <th scope="col" className="py-2 pr-3 font-bold">Tutar</th>
                  <th scope="col" className="py-2 pr-3 font-bold">Geçerlilik</th>
                  <th scope="col" className="py-2 pr-3 font-bold">Kaydeden</th>
                  <th scope="col" className="py-2 font-bold">Not</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settings.appReservationFeeHistory.map(rate => (
                  <tr key={rate.effectiveFrom}>
                    <td className="py-2 pr-3 font-bold text-slate-900">{formatTl(rate.amount)}</td>
                    <td className="py-2 pr-3 text-slate-700">{formatDateTime(rate.effectiveFrom)}</td>
                    <td className="py-2 pr-3 text-slate-700">{rate.createdByName}</td>
                    <td className="py-2 text-slate-600">{rate.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`${cardClass} p-5 space-y-4`} aria-labelledby="policy-title">
        <div>
          <h2 id="policy-title" className="text-sm font-black text-slate-900">Fatura ayarları</h2>
          <p className="text-xs text-slate-600 mt-0.5">Aylık hesap özetleri bu ayarlarla hesaplanır. KDV durumunu muhasebecinizle netleştirin.</p>
        </div>
        {!settings.billingPolicy && <Alert tone="warning">Fatura ayarı kaydedilmedi: hesap özeti oluşturulamaz.</Alert>}
        {policyFeedback && <Alert tone={policyFeedback.tone}>{policyFeedback.text}</Alert>}
        <form onSubmit={savePolicy} className="space-y-4" noValidate>
          <fieldset className="space-y-2">
            <legend className={labelClass}>Ücretler KDV</legend>
            {[
              { value: false, label: 'KDV hariç: hesap özetine KDV eklenir' },
              { value: true, label: 'KDV dahil: tutarın içinde KDV vardır' }
            ].map(option => (
              <label key={String(option.value)} className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 min-h-[36px] cursor-pointer">
                <input
                  type="radio"
                  name="vat-mode"
                  className="w-4 h-4 accent-amber-500"
                  checked={policy.amountsIncludeVat === option.value}
                  onChange={() => setPolicy(prev => ({ ...prev, amountsIncludeVat: option.value }))}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="vat-rate" className={labelClass}>KDV oranı (%)</label>
              <input id="vat-rate" type="number" min={0} max={100} className={inputClass} value={policy.vatRatePercent} onChange={e => setPolicy(prev => ({ ...prev, vatRatePercent: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="due-days" className={labelClass}>Ödeme vadesi (gün)</label>
              <input id="due-days" type="number" min={1} max={90} className={inputClass} value={policy.statementDueDays} onChange={e => setPolicy(prev => ({ ...prev, statementDueDays: e.target.value }))} />
            </div>
          </div>
          <label className="flex items-start gap-2.5 text-xs text-slate-800 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 mt-0.5 accent-amber-500" checked={policy.chargeNoShow} onChange={e => setPolicy(prev => ({ ...prev, chargeNoShow: e.target.checked }))} />
            <span><strong>Gelmeyen (no-show) rezervasyonlarda ücret alınır.</strong> Kapalıysa kulüp "Gelmedi" işaretlediğinde ücret silinir.</span>
          </label>
          {vatPreview && <Alert tone="info">{vatPreview}</Alert>}
          <div className="flex justify-end">
            <button type="submit" className={primaryButton} disabled={savingPolicy}>{savingPolicy ? 'Kaydediliyor...' : 'Fatura Ayarlarını Kaydet'}</button>
          </div>
        </form>
      </section>

      <section className={`${cardClass} p-5 space-y-3`} aria-labelledby="lesson-title">
        <h2 id="lesson-title" className="text-sm font-black text-slate-900">Kulüp ders ücretleri</h2>
        <p className="text-xs text-slate-600">Her kulüp için ayrı belirlenir; kulüp sayfasındaki "Ders platform ücreti" bölümünden değiştirilir.</p>
        {settings.lessonFees.length === 0 ? (
          <Alert tone="info">Henüz ders ücreti tanımlanmış kulüp yok.</Alert>
        ) : (
          <ul className="divide-y divide-slate-100">
            {settings.lessonFees.map(fee => (
              <li key={fee.clubId} className="py-2 flex flex-wrap justify-between gap-2 text-xs">
                <span className="font-bold text-slate-900">{fee.clubName}</span>
                <span className="text-slate-700">{formatTl(fee.amount)} · {LESSON_BASIS_LABELS[fee.basis]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
