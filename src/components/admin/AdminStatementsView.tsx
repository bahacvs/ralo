import React, { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import { Modal } from '../common/Modal.js';
import type { MonthlyStatement } from '../../types/admin.js';
import { StatementDetail } from './StatementDetail.js';
import {
  PageHeader, Alert, inputClass, labelClass, primaryButton, secondaryButton, dangerButton, cardClass,
  formatTl, formatDate, periodLabel, finishedPeriods, STATEMENT_STATUS
} from './adminUi.js';

export const AdminStatementsView: React.FC = () => {
  const periods = finishedPeriods(12);
  const [period, setPeriod] = useState(periods[0]);
  const [statements, setStatements] = useState<MonthlyStatement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  const [detail, setDetail] = useState<MonthlyStatement | null>(null);
  const [paying, setPaying] = useState<MonthlyStatement | null>(null);
  const [paidAmount, setPaidAmount] = useState('');
  const [reference, setReference] = useState('');
  const [cancelling, setCancelling] = useState<MonthlyStatement | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async (target = period) => {
    setError(null);
    setStatements(null);
    try {
      setStatements((await api.admin.statements(target === 'all' ? undefined : target)).statements);
    } catch (err: any) {
      setError(err.message || 'Hesap özetleri yüklenemedi.');
    }
  };

  useEffect(() => {
    load(period);
  }, [period]);

  const generate = async () => {
    if (!window.confirm(`${periodLabel(period)} dönemi için tahakkuk eden ücretlerden hesap özeti oluşturulsun mu? Kulüp sahiplerine bildirim gider.`)) return;
    setGenerating(true);
    setNotice(null);
    try {
      const res = await api.admin.generateStatements(period);
      setNotice(res.created > 0
        ? { tone: 'success', text: `${res.created} kulüp için ${periodLabel(period)} hesap özeti oluşturuldu.` }
        : { tone: 'info', text: `${periodLabel(period)} için hesap özeti oluşturulacak yeni ücret yok.` });
      await load(period);
    } catch (err: any) {
      setNotice({ tone: 'error', text: err.message || 'Hesap özeti oluşturulamadı.' });
    } finally {
      setGenerating(false);
    }
  };

  const openDetail = async (statement: MonthlyStatement) => {
    setDetail(statement);
    try {
      setDetail((await api.admin.statement(statement.id)).statement);
    } catch {
      // keep the summary row
    }
  };

  const submitPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paying) return;
    setSaving(true);
    setModalError(null);
    try {
      await api.admin.markStatementPaid(paying.id, { paidAmount: paidAmount === '' ? undefined : Number(paidAmount), paymentReference: reference || undefined });
      setNotice({ tone: 'success', text: `${paying.clubName} ${paying.statementNo} ödendi olarak işaretlendi.` });
      setPaying(null);
      await load(period);
    } catch (err: any) {
      setModalError(err.message || 'Kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const submitCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelling) return;
    setSaving(true);
    setModalError(null);
    try {
      await api.admin.cancelStatement(cancelling.id, cancelReason);
      setNotice({ tone: 'success', text: `${cancelling.statementNo} iptal edildi. Ücretler aynı dönem için yeniden özetlenebilir.` });
      setCancelling(null);
      await load(period);
    } catch (err: any) {
      setModalError(err.message || 'İptal edilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const open = (statements ?? []).filter(s => s.status === 'issued' || s.status === 'overdue');
  const paid = (statements ?? []).filter(s => s.status === 'paid');

  return (
    <div className="space-y-6 pb-12">
      <PageHeader title="Hesap Özetleri" description="Kulüpler ödemeyi banka havalesiyle yapar; havaleyi gördüğünüzde ödendi olarak işaretleyin." />

      <div className={`${cardClass} p-4 flex flex-col sm:flex-row sm:items-end gap-3`}>
        <div className="sm:w-60">
          <label htmlFor="period" className={labelClass}>Dönem</label>
          <select id="period" className={inputClass} value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="all">Tüm dönemler</option>
            {periods.map(p => <option key={p} value={p}>{periodLabel(p)}</option>)}
          </select>
        </div>
        <button type="button" className={primaryButton} onClick={generate} disabled={generating || period === 'all'}>
          {generating ? 'Oluşturuluyor...' : 'Bu Dönem İçin Hesap Özeti Oluştur'}
        </button>
        <p className="text-[11px] text-slate-500 sm:ml-auto sm:max-w-xs">Yalnızca biten aylar için oluşturulur. Hesap özeti olan kulüpler atlanır.</p>
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {error ? (
        <ErrorState message={error} onRetry={() => load(period)} />
      ) : !statements ? (
        <LoadingState message="Hesap özetleri yükleniyor..." />
      ) : statements.length === 0 ? (
        <Alert tone="info">Bu dönem için hesap özeti yok.</Alert>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className={`${cardClass} p-4`}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Bekleyen ödeme</p>
              <p className="text-xl font-black text-slate-900 mt-1">{formatTl(open.reduce((sum, s) => sum + s.total, 0))}</p>
              <p className="text-[11px] text-slate-500">{open.length} hesap özeti</p>
            </div>
            <div className={`${cardClass} p-4`}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Tahsil edilen</p>
              <p className="text-xl font-black text-slate-900 mt-1">{formatTl(paid.reduce((sum, s) => sum + (s.paidAmount ?? s.total), 0))}</p>
              <p className="text-[11px] text-slate-500">{paid.length} hesap özeti</p>
            </div>
          </div>

          <div className={`${cardClass} overflow-x-auto`}>
            <table className="w-full text-xs min-w-[760px]">
              <caption className="sr-only">Hesap özetleri</caption>
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th scope="col" className="p-3 font-bold">Kulüp</th>
                  <th scope="col" className="p-3 font-bold">Dönem</th>
                  <th scope="col" className="p-3 font-bold text-right">Rezervasyon</th>
                  <th scope="col" className="p-3 font-bold text-right">Toplam</th>
                  <th scope="col" className="p-3 font-bold">Vade</th>
                  <th scope="col" className="p-3 font-bold">Durum</th>
                  <th scope="col" className="p-3 font-bold"><span className="sr-only">İşlemler</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statements.map(s => (
                  <tr key={s.id}>
                    <td className="p-3">
                      <p className="font-bold text-slate-900">{s.clubName}</p>
                      <p className="text-slate-500 font-mono">{s.statementNo}</p>
                    </td>
                    <td className="p-3 text-slate-700">{periodLabel(s.period)}</td>
                    <td className="p-3 text-right text-slate-700">{s.reservationFeeCount} adet</td>
                    <td className="p-3 text-right font-black text-slate-900">{formatTl(s.total)}</td>
                    <td className="p-3 text-slate-700">{formatDate(s.dueDate)}</td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full font-bold ${STATEMENT_STATUS[s.status].className}`}>{STATEMENT_STATUS[s.status].label}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" className={secondaryButton} onClick={() => openDetail(s)}>Detay</button>
                        {(s.status === 'issued' || s.status === 'overdue') && (
                          <>
                            <button type="button" className={primaryButton} onClick={() => { setPaying(s); setPaidAmount(String(s.total)); setReference(''); setModalError(null); }}>Ödendi</button>
                            <button type="button" className={secondaryButton} onClick={() => { setCancelling(s); setCancelReason(''); setModalError(null); }}>İptal</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.clubName} · ${periodLabel(detail.period)}` : ''} maxWidth="lg">
        {detail && <StatementDetail statement={detail} />}
      </Modal>

      <Modal isOpen={!!paying} onClose={() => setPaying(null)} title="Ödendi olarak işaretle" description={paying ? `${paying.clubName} · ${paying.statementNo}` : ''} maxWidth="md">
        <form onSubmit={submitPaid} className="space-y-4" noValidate>
          {modalError && <Alert tone="error">{modalError}</Alert>}
          <div>
            <label htmlFor="paid-amount" className={labelClass}>Gelen tutar (TL)</label>
            <input id="paid-amount" type="number" min={0} step="0.01" className={inputClass} value={paidAmount} onChange={e => setPaidAmount(e.target.value)} />
          </div>
          <div>
            <label htmlFor="paid-reference" className={labelClass}>Havale açıklaması / dekont no (isteğe bağlı)</label>
            <input id="paid-reference" className={inputClass} value={reference} maxLength={120} onChange={e => setReference(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryButton} onClick={() => setPaying(null)}>Vazgeç</button>
            <button type="submit" className={primaryButton} disabled={saving}>{saving ? 'Kaydediliyor...' : 'Ödendi Olarak İşaretle'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!cancelling} onClose={() => setCancelling(null)} title="Hesap özetini iptal et" description="İçindeki ücretler yeniden tahakkuk durumuna döner; düzeltip aynı dönem için yeniden oluşturabilirsiniz." maxWidth="md">
        <form onSubmit={submitCancel} className="space-y-4" noValidate>
          {modalError && <Alert tone="error">{modalError}</Alert>}
          <div>
            <label htmlFor="cancel-reason" className={labelClass}>İptal nedeni</label>
            <textarea id="cancel-reason" rows={3} className={`${inputClass} py-2`} value={cancelReason} maxLength={300} onChange={e => setCancelReason(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryButton} onClick={() => setCancelling(null)}>Vazgeç</button>
            <button type="submit" className={dangerButton} disabled={saving || cancelReason.trim().length < 3}>{saving ? 'İptal ediliyor...' : 'Hesap Özetini İptal Et'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
