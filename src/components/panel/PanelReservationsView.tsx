import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, EmptyState, ErrorState } from '../common/StateViews.js';
import { CheckCircle2, XCircle, Clock, Search, Filter } from 'lucide-react';

export const PanelReservationsView: React.FC = () => {
  const { user } = useAuth();
  const businessId = user?.businessId || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reservations, setReservations] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchReservations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPanelSchedule(businessId, new Date().toISOString().split('T')[0], 7);
      setReservations(res.reservations || []);
    } catch (err: any) {
      setError(err.message || 'Rezervasyonlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservations();
  }, [businessId]);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await api.updateReservationStatus(id, newStatus);
      await fetchReservations();
    } catch (err: any) {
      alert(err.message || 'Hata oluştu');
    }
  };

  const handleUpdatePayment = async (id: string, newPayment: string) => {
    try {
      await api.updateReservationPayment(id, newPayment);
      await fetchReservations();
    } catch (err: any) {
      alert(err.message || 'Hata oluştu');
    }
  };

  const filtered = reservations.filter(r => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const name = (r.ownerMaskedName || '').toLowerCase();
      const phone = (r.ownerPhone || '').toLowerCase();
      return name.includes(term) || phone.includes(term) || r.id.toLowerCase().includes(term);
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-serif">
          Rezervasyon ve Tahsilat Yönetimi
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
          Tüm rezervasyonları arayın, tahsilat ve gelmeme (No-Show) durumlarını güncelleyin
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <label htmlFor="search-res" className="sr-only">Rezervasyon Ara</label>
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="search-res"
            type="search"
            placeholder="İsim, telefon veya kod ile ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="res-status-filter" className="text-xs font-bold text-slate-700">Durum:</label>
          <select
            id="res-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
          >
            <option value="ALL">Tümü ({reservations.length})</option>
            <option value="CONFIRMED">Onaylı</option>
            <option value="COMPLETED">Tamamlandı</option>
            <option value="NO_SHOW">Gelmedi (No-Show)</option>
            <option value="CANCELLED">İptal Edildi</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState message="Rezervasyonlar listeleniyor..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchReservations} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Rezervasyon Kaydı Bulunamadı"
          description="Arama kriterlerinize veya filtreye uygun rezervasyon kaydı bulunamadı."
        />
      ) : (
        /* Semantic WCAG Accessible Table */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <caption className="sr-only">İşletme Rezervasyonları ve Tahsilat Durumları Tablosu</caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th scope="col" className="p-4">Tarih & Saat</th>
                  <th scope="col" className="p-4">Müşteri / Oyuncu</th>
                  <th scope="col" className="p-4">Tür</th>
                  <th scope="col" className="p-4">Tutar</th>
                  <th scope="col" className="p-4">Ödeme Durumu</th>
                  <th scope="col" className="p-4">Rezervasyon Durumu</th>
                  <th scope="col" className="p-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((res) => (
                  <tr key={res.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-4 font-bold text-slate-900 whitespace-nowrap">
                      {new Date(res.startAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} • {res.startAt.split('T')[1].slice(0, 5)}
                      <span className="text-[10px] text-slate-400 block font-normal">{res.durationMinutes} Dk</span>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-slate-900">{res.ownerMaskedName}</div>
                      <div className="text-slate-500 text-[11px] font-mono">{res.ownerPhone || 'Kayıtlı değil'}</div>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md text-[11px]">
                        {res.isOpenMatch ? 'Açık Maç' : 'Özel Randevu'}
                      </span>
                    </td>
                    <td className="p-4 font-extrabold text-slate-900 whitespace-nowrap">
                      {res.totalPrice} ₺
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleUpdatePayment(res.id, res.paymentStatus === 'PAID' ? 'PAY_AT_VENUE' : 'PAID')}
                        className={`inline-flex items-center gap-1 font-bold px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                          res.paymentStatus === 'PAID'
                            ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                            : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                        }`}
                        title="Ödeme durumunu değiştirmek için tıklayın"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{res.paymentStatus === 'PAID' ? 'Tahsil Edildi' : 'Bekliyor'}</span>
                      </button>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={`inline-block font-extrabold px-2.5 py-1 rounded-full text-[11px] ${
                        res.status === 'CONFIRMED' || res.status === 'COMPLETED'
                          ? 'bg-amber-50 text-amber-900 border border-amber-200'
                          : res.status === 'NO_SHOW'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {res.status === 'CONFIRMED' ? 'Onaylı' : res.status === 'COMPLETED' ? 'Tamamlandı' : res.status === 'NO_SHOW' ? 'Gelmedi' : 'İptal'}
                      </span>
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(res.id, 'NO_SHOW')}
                          className="min-h-[38px] px-2.5 py-1 rounded-lg text-xs font-bold text-red-700 hover:bg-red-50"
                        >
                          Gelmedi
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(res.id, 'COMPLETED')}
                          className="min-h-[38px] px-2.5 py-1 rounded-lg text-xs font-bold text-amber-800 hover:bg-amber-50"
                        >
                          Tamamlandı
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
