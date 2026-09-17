import React, { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import type { ErrorGroup } from '../../types/admin.js';
import { PageHeader, Alert, cardClass, formatDateTime } from './adminUi.js';

export const AdminErrorsView: React.FC = () => {
  const [days, setDays] = useState(7);
  const [groups, setGroups] = useState<ErrorGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setGroups(null);
    try {
      setGroups((await api.admin.errors(days)).groups);
    } catch (err: any) {
      setError(err.message || 'Hata kayıtları yüklenemedi.');
    }
  };

  useEffect(() => {
    load();
  }, [days]);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Hatalar"
        description="Sunucuda ve kullanıcıların tarayıcısında oluşan beklenmedik hatalar. Kişisel veri tutulmaz; kayıtlar 30 gün saklanır."
        actions={
          <div role="tablist" aria-label="Zaman aralığı" className="flex bg-slate-100 p-1 rounded-xl">
            {[1, 7, 30].map(d => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={days === d}
                onClick={() => setDays(d)}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-bold cursor-pointer ${days === d ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
              >
                {d === 1 ? 'Son 24 saat' : `Son ${d} gün`}
              </button>
            ))}
          </div>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !groups ? (
        <LoadingState message="Hata kayıtları yükleniyor..." />
      ) : groups.length === 0 ? (
        <Alert tone="success">Bu aralıkta kayıtlı hata yok.</Alert>
      ) : (
        <ul className="space-y-3">
          {groups.map(group => (
            <li key={group.fingerprint} className={`${cardClass} p-4 space-y-2`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${group.source === 'server' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>
                      {group.source === 'server' ? 'Sunucu' : 'Tarayıcı'}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{group.count} kez</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 break-words">{group.message}</p>
                  <p className="text-xs text-slate-500 mt-0.5 break-all">
                    {group.lastMethod ? `${group.lastMethod} ` : ''}{group.lastPath ?? '—'}
                  </p>
                </div>
                <div className="text-[11px] text-slate-500 text-right shrink-0">
                  <p>Son: {formatDateTime(group.lastSeen)}</p>
                  <p>İlk: {formatDateTime(group.firstSeen)}</p>
                </div>
              </div>
              {(group.lastStack || group.lastUserAgent) && (
                <details>
                  <summary className="text-xs font-bold text-slate-700 cursor-pointer">Ayrıntılar</summary>
                  {group.lastUserAgent && <p className="text-[11px] text-slate-500 mt-2 break-all">Tarayıcı: {group.lastUserAgent}</p>}
                  {group.lastStack && (
                    <pre className="mt-2 p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] overflow-x-auto whitespace-pre">{group.lastStack}</pre>
                  )}
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
