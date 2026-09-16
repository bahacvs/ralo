import React, { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import { Modal } from '../common/Modal.js';
import type { MonthlyStatement } from '../../types/admin.js';
import { StatementDetail } from '../admin/StatementDetail.js';
import { formatTl, formatDate, periodLabel, STATEMENT_STATUS } from '../admin/adminUi.js';
import { Receipt, Info } from 'lucide-react';

/** Club owner's monthly RALO statements (platform fees for app reservations and lessons). */
export const PanelStatementsView: React.FC = () => {
  const [statements, setStatements] = useState<MonthlyStatement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<MonthlyStatement | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<{ iban: string; accountName: string | null } | null>(null);

  const load = async () => {
    setError(null);
    try {
      const res = await api.getPanelStatements();
      setStatements(res.statements);
      setPaymentInfo(res.paymentInfo);
    } catch (err: any) {
      setError(err.message || 'Hesap özetleri yüklenemedi.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openDetail = async (statement: MonthlyStatement) => {
    setDetail(statement);
    try {
      setDetail((await api.getPanelStatement(statement.id)).statement);
    } catch {
      // keep the summary
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-serif">Hesap Özetleri</h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-0.5">RALO üzerinden gelen rezervasyonların aylık platform ücretleri</p>
      </div>

      <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-px text-amber-600" aria-hidden="true" />
        <p>
          Yalnızca oyuncuların uygulamadan yaptığı rezervasyonlar ücretlendirilir. Panelden girdiğiniz ve iptal edilen rezervasyonlardan ücret alınmaz.
          Ödemeyi banka havalesiyle yapın ve açıklamaya <strong>hesap özeti numarasını</strong> yazın.
          {paymentInfo && (
            <span className="block mt-2">
              IBAN: <strong className="font-mono select-all">{paymentInfo.iban}</strong>
              {paymentInfo.accountName && <> · Alıcı: <strong>{paymentInfo.accountName}</strong></>}
            </span>
          )}
        </p>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !statements ? (
        <LoadingState message="Hesap özetleri yükleniyor..." />
      ) : statements.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-sm text-slate-600">
          <Receipt className="w-8 h-8 mx-auto text-slate-300 mb-2" aria-hidden="true" />
          Henüz hesap özetiniz yok. Her ayın başında bir önceki ayın özeti burada görünür.
        </div>
      ) : (
        <ul className="bg-white rounded-3xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
          {statements.map(s => (
            <li key={s.id}>
              <button type="button" onClick={() => openDetail(s)} className="w-full text-left p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-2 hover:bg-slate-50 cursor-pointer">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900">{periodLabel(s.period)}</p>
                  <p className="text-xs text-slate-500 font-mono">{s.statementNo}</p>
                </div>
                <div className="text-xs text-slate-600">{s.reservationFeeCount} uygulama rezervasyonu · Son ödeme {formatDate(s.dueDate)}</div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-slate-900">{formatTl(s.total)}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${STATEMENT_STATUS[s.status].className}`}>{STATEMENT_STATUS[s.status].label}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail ? `Hesap Özeti · ${periodLabel(detail.period)}` : ''} maxWidth="lg">
        {detail && <StatementDetail statement={detail} />}
      </Modal>
    </div>
  );
};
