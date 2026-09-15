import React, { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import type { AdminUserRow } from '../../types/admin.js';
import { PageHeader, Alert, inputClass, cardClass, formatDate } from './adminUi.js';
import { Search } from 'lucide-react';

export const AdminUsersView: React.FC = () => {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setError(null);
      try {
        const res = await api.admin.users(search.trim() || undefined);
        if (!cancelled) setRows(res.users);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Kullanıcılar yüklenemedi.');
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader title="Kullanıcılar" description="Son kaydolan 50 hesap; e-posta veya isimle arayın." />

      <div className="relative">
        <label htmlFor="user-search" className="sr-only">Kullanıcı ara</label>
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
        <input id="user-search" type="search" className={`${inputClass} pl-10`} placeholder="E-posta veya ad" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : !rows ? (
        <LoadingState message="Kullanıcılar yükleniyor..." />
      ) : rows.length === 0 ? (
        <Alert tone="info">Eşleşen kullanıcı yok.</Alert>
      ) : (
        <ul className={`${cardClass} divide-y divide-slate-100 overflow-hidden`}>
          {rows.map(u => (
            <li key={u.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900">{u.displayName}</p>
                <p className="text-slate-600 break-all">{u.email ?? '—'}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {u.isPlatformAdmin && <span className="px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900">Platform yöneticisi</span>}
                {u.clubName && (
                  <span className="px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700">
                    {u.clubRole === 'owner' ? 'Sahip' : 'Personel'} · {u.clubName}
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded-full font-bold ${u.emailVerified ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                  {u.emailVerified ? 'E-posta doğrulandı' : 'Doğrulanmadı'}
                </span>
                {u.status !== 'active' && <span className="px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-800">{u.status}</span>}
              </div>
              <div className="text-slate-500 sm:text-right sm:w-36">
                <p>Kayıt: {formatDate(u.createdAt)}</p>
                <p>Son giriş: {formatDate(u.lastLoginAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
