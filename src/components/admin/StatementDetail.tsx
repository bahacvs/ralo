import React from 'react';
import type { MonthlyStatement } from '../../types/admin.js';
import { formatTl, formatDate, formatDateTime, periodLabel, STATEMENT_STATUS } from './adminUi.js';

/** Statement summary and line items; shared by the admin screen and the club owner's panel. */
export const StatementDetail: React.FC<{ statement: MonthlyStatement }> = ({ statement: s }) => (
  <div className="space-y-4 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-mono text-slate-600">{s.statementNo}</p>
      <span className={`px-2 py-0.5 rounded-full font-bold ${STATEMENT_STATUS[s.status].className}`}>{STATEMENT_STATUS[s.status].label}</span>
    </div>

    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 p-3 rounded-2xl bg-slate-50">
      <dt className="text-slate-600">Dönem</dt>
      <dd className="text-right font-semibold text-slate-900">{periodLabel(s.period)}</dd>
      <dt className="text-slate-600">Uygulama rezervasyonları ({s.reservationFeeCount})</dt>
      <dd className="text-right font-semibold text-slate-900">{formatTl(s.reservationFeeTotal)}</dd>
      {s.lessonFeeCount > 0 && (
        <>
          <dt className="text-slate-600">Dersler ({s.lessonFeeCount})</dt>
          <dd className="text-right font-semibold text-slate-900">{formatTl(s.lessonFeeTotal)}</dd>
        </>
      )}
      {s.adjustmentsTotal !== 0 && (
        <>
          <dt className="text-slate-600">Düzeltmeler</dt>
          <dd className="text-right font-semibold text-slate-900">{formatTl(s.adjustmentsTotal)}</dd>
        </>
      )}
      <dt className="text-slate-600">Ara toplam</dt>
      <dd className="text-right font-semibold text-slate-900">{formatTl(s.subtotal)}</dd>
      <dt className="text-slate-600">KDV (%{s.vatRatePercent})</dt>
      <dd className="text-right font-semibold text-slate-900">{formatTl(s.vatTotal)}</dd>
      <dt className="text-slate-900 font-black">Toplam</dt>
      <dd className="text-right font-black text-slate-900 text-sm">{formatTl(s.total)}</dd>
      <dt className="text-slate-600">Son ödeme tarihi</dt>
      <dd className="text-right font-semibold text-slate-900">{formatDate(s.dueDate)}</dd>
      {s.paidAt && (
        <>
          <dt className="text-slate-600">Ödeme</dt>
          <dd className="text-right font-semibold text-emerald-700">{formatTl(s.paidAmount)} · {formatDateTime(s.paidAt)}</dd>
        </>
      )}
      {s.paymentReference && (
        <>
          <dt className="text-slate-600">Havale açıklaması</dt>
          <dd className="text-right font-semibold text-slate-900 break-all">{s.paymentReference}</dd>
        </>
      )}
      {s.cancelledReason && (
        <>
          <dt className="text-slate-600">İptal nedeni</dt>
          <dd className="text-right font-semibold text-slate-900">{s.cancelledReason}</dd>
        </>
      )}
    </dl>

    {s.lines && s.lines.length > 0 && (
      <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-200">
        <table className="w-full">
          <caption className="sr-only">Hesap özeti kalemleri</caption>
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th scope="col" className="p-2 font-bold">Tarih</th>
              <th scope="col" className="p-2 font-bold">Açıklama</th>
              <th scope="col" className="p-2 font-bold text-right">Tutar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {s.lines.map((line, index) => (
              <tr key={index}>
                <td className="p-2 text-slate-600 whitespace-nowrap">{formatDate(line.serviceDate)}</td>
                <td className="p-2 text-slate-800">{line.description}</td>
                <td className="p-2 text-right font-semibold text-slate-900 whitespace-nowrap">{formatTl(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
