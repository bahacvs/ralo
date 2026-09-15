import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, EmptyState, ErrorState } from '../common/StateViews.js';
import { Modal } from '../common/Modal.js';
import { 
  Calendar, Clock, Plus, ShieldBan, UserCheck, 
  CheckCircle2, XCircle, AlertTriangle, ChevronLeft, ChevronRight, 
  List, CalendarDays, RefreshCw, Phone, User
} from 'lucide-react';

export const PanelCalendarView: React.FC = () => {
  const { user } = useAuth();
  const businessId = user?.businessId || '';

  const todayStr = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState<string>(todayStr);
  const [viewMode, setViewMode] = useState<'TIMELINE' | 'LIST'>('TIMELINE');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduleData, setScheduleData] = useState<any | null>(null);

  // Modals state
  const [showManualModal, setShowManualModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [selectedRes, setSelectedRes] = useState<any | null>(null);

  // Manual Reservation Form
  const [manCourtId, setManCourtId] = useState('');
  const [manName, setManName] = useState('');
  const [manPhone, setManPhone] = useState('');
  const [manTime, setManTime] = useState('18:00');
  const [manDuration, setManDuration] = useState<60 | 90 | 120>(90);
  const [manPayment, setManPayment] = useState('PAY_AT_VENUE');
  const [manError, setManError] = useState<string | null>(null);
  const [manSubmitting, setManSubmitting] = useState(false);

  // Block Form
  const [blockCourtId, setBlockCourtId] = useState('');
  const [blockStartTime, setBlockStartTime] = useState('12:00');
  const [blockEndTime, setBlockEndTime] = useState('14:00');
  const [blockReason, setBlockReason] = useState('MAINTENANCE');
  const [blockNote, setBlockNote] = useState('');
  const [blockError, setBlockError] = useState<string | null>(null);
  const [blockSubmitting, setBlockSubmitting] = useState(false);

  const fetchSchedule = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPanelSchedule(businessId, date, 1);
      setScheduleData(res);
      if (res.courts.length > 0) {
        if (!manCourtId) setManCourtId(res.courts[0].id);
        if (!blockCourtId) setBlockCourtId(res.courts[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Program takvimi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedule();
  }, [businessId, date]);

  const handlePrevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(d.toISOString().split('T')[0]);
  };

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manName.trim() || !manPhone.trim() || !manCourtId) {
      setManError('Lütfen tüm zorunlu alanları doldurunuz.');
      return;
    }

    setManSubmitting(true);
    setManError(null);
    try {
      await api.createManualReservation({
        courtId: manCourtId,
        businessId,
        customerName: manName,
        customerPhone: manPhone,
        date,
        startTime: manTime,
        durationMinutes: manDuration,
        paymentStatus: manPayment
      });
      setShowManualModal(false);
      setManName('');
      setManPhone('');
      await fetchSchedule();
    } catch (err: any) {
      setManError(err.message || 'Rezervasyon oluşturulurken bir çakışma oluştu.');
    } finally {
      setManSubmitting(false);
    }
  };

  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockCourtId || !blockStartTime || !blockEndTime) {
      setBlockError('Lütfen başlangıç ve bitiş saatlerini belirtiniz.');
      return;
    }

    setBlockSubmitting(true);
    setBlockError(null);
    try {
      await api.createCourtBlock({
        courtId: blockCourtId,
        businessId,
        date,
        startTime: blockStartTime,
        endTime: blockEndTime,
        reason: blockReason,
        reasonNote: blockNote
      });
      setShowBlockModal(false);
      setBlockNote('');
      await fetchSchedule();
    } catch (err: any) {
      setBlockError(err.message || 'Saat blokajı oluşturulurken çakışma oluştu.');
    } finally {
      setBlockSubmitting(false);
    }
  };

  const handleStatusChange = async (resId: string, newStatus: string) => {
    try {
      await api.updateReservationStatus(resId, newStatus);
      setSelectedRes(null);
      await fetchSchedule();
    } catch (err: any) {
      alert(err.message || 'Durum güncellenemedi.');
    }
  };

  const handlePaymentChange = async (resId: string, newPayment: string) => {
    try {
      await api.updateReservationPayment(resId, newPayment);
      setSelectedRes(null);
      await fetchSchedule();
    } catch (err: any) {
      alert(err.message || 'Tahsilat durumu güncellenemedi.');
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    try {
      await api.deleteCourtBlock(blockId);
      await fetchSchedule();
    } catch (err: any) {
      alert(err.message || 'Blokaj kaldırılamadı.');
    }
  };

  if (loading) return <LoadingState message="Günlük takvim verileri alınıyor..." />;
  if (error) return <ErrorState message={error} onRetry={fetchSchedule} />;
  if (!scheduleData) return null;

  const { courts = [], reservations = [], blocks = [] } = scheduleData;

  const hoursList = [
    '08:30', '10:00', '11:30', '13:00', '14:30', 
    '16:00', '17:30', '19:00', '20:30', '22:00'
  ];

  return (
    <div className="space-y-6 pb-12">
      
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-serif">
            Günlük Kort Takvimi & Rezervasyon Yönetimi
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Kort müsaitlikleri, anlık blokajlar ve tahsilat takibi
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowManualModal(true)}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors shadow-xs focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Manuel Rezervasyon</span>
          </button>

          <button
            type="button"
            onClick={() => setShowBlockModal(true)}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <ShieldBan className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <span>Saat Blokajı</span>
          </button>
        </div>
      </div>

      {/* Date Navigation & View Mode Toggle Bar */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        
        {/* Date Selector with Day Back / Forward */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevDay}
            aria-label="Önceki Gün"
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700 focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
            />
            {date !== todayStr && (
              <button
                type="button"
                onClick={() => setDate(todayStr)}
                className="text-xs font-bold text-amber-900 hover:text-amber-950 px-2.5 py-1.5 rounded-lg bg-amber-100 border border-amber-300 min-h-[44px] flex items-center"
              >
                Bugüne Dön
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleNextDay}
            aria-label="Sonraki Gün"
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700 focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* View Mode Toggle: Timeline vs Accessible List */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('TIMELINE')}
            className={`flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl text-xs font-bold transition-all ${
              viewMode === 'TIMELINE' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Çizelge</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('LIST')}
            className={`flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl text-xs font-bold transition-all ${
              viewMode === 'LIST' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Erişilebilir Liste</span>
          </button>
        </div>

      </div>

      {/* TIMELINE VIEW */}
      {viewMode === 'TIMELINE' ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-x-auto">
          <div className="min-w-[760px] p-5">
            {/* Header: Court Columns */}
            <div className="grid grid-cols-4 gap-3 pb-4 border-b border-slate-200 text-xs font-bold text-slate-800">
              <div className="text-slate-400 font-medium">Saat Aralığı</div>
              {courts.map((c: any) => (
                <div key={c.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="block font-bold text-slate-900">{c.name}</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    {c.type === 'OUTDOOR_PANORAMIC' ? 'Panoramik' : 'Kapalı'} • {c.pricePerHour} ₺/saat
                  </span>
                </div>
              ))}
            </div>

            {/* Time Slot Rows */}
            <div className="divide-y divide-slate-100 mt-2">
              {hoursList.map((hour) => {
                const hourPrefix = `${date}T${hour}`;

                return (
                  <div key={hour} className="grid grid-cols-4 gap-3 py-2.5 items-center">
                    {/* Time Indicator */}
                    <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{hour}</span>
                    </div>

                    {/* Court Slots */}
                    {courts.map((court: any) => {
                      // Check for reservation starting at this hour
                      const res = reservations.find((r: any) => 
                        r.courtId === court.id && 
                        r.startAt.startsWith(hourPrefix) && 
                        r.status !== 'CANCELLED'
                      );

                      // Check for block
                      const blk = blocks.find((b: any) => 
                        b.courtId === court.id && 
                        b.startAt <= `${hourPrefix}:00` && 
                        b.endAt > `${hourPrefix}:00`
                      );

                      if (blk) {
                        return (
                          <div
                            key={court.id}
                            className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between"
                          >
                            <div>
                              <span className="font-bold flex items-center gap-1">
                                <ShieldBan className="w-3.5 h-3.5 text-amber-600" /> Blokajlı
                              </span>
                              <span className="text-[10px] text-amber-700 block mt-0.5">
                                {blk.reason === 'MAINTENANCE' ? 'Bakım' : blk.reason === 'TRAINING' ? 'Antrenman' : 'Turnuva'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteBlock(blk.id)}
                              className="text-[10px] text-red-600 hover:text-red-800 font-bold p-1"
                              title="Blokajı Kaldır"
                            >
                              Kaldır
                            </button>
                          </div>
                        );
                      }

                      if (res) {
                        return (
                          <div
                            key={court.id}
                            onClick={() => setSelectedRes(res)}
                            role="button"
                            tabIndex={0}
                            className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs cursor-pointer hover:shadow-xs transition-all flex flex-col justify-between"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold truncate">{res.ownerMaskedName}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                                res.paymentStatus === 'PAID' ? 'bg-amber-200 text-amber-950 font-bold' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {res.paymentStatus === 'PAID' ? 'Ödendi' : 'Ödeme Tesisde'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-1 text-[11px] text-amber-900 font-semibold">
                              <span>{res.totalPrice} ₺</span>
                              <span className="font-medium">{res.isOpenMatch ? `Açık (${res.participantsCount}/4)` : 'Özel'}</span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={court.id}
                          type="button"
                          onClick={() => {
                            setManCourtId(court.id);
                            setManTime(hour);
                            setShowManualModal(true);
                          }}
                          className="p-2.5 rounded-xl border border-dashed border-slate-200 hover:border-amber-500 hover:bg-amber-50/50 text-slate-400 hover:text-amber-900 text-xs text-center transition-colors min-h-[44px] flex items-center justify-center font-medium"
                        >
                          + Boş Randevu
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ACCESSIBLE LIST VIEW */
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-3">
          <h2 className="text-sm font-bold text-slate-900">
            {new Date(date).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} Rezervasyonları
          </h2>

          {reservations.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">Bu tarihte henüz bir rezervasyon bulunmuyor.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {reservations.map((r: any) => (
                <div key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{r.startAt.split('T')[1].slice(0, 5)}</span>
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                        {courts.find((c: any) => c.id === r.courtId)?.name || 'Kort'}
                      </span>
                      <span className="font-bold text-slate-900">{r.ownerMaskedName} ({r.ownerPhone})</span>
                    </div>
                    <p className="text-slate-500 mt-1">
                      {r.durationMinutes} dk • {r.totalPrice} ₺ • {r.source === 'PANEL' ? 'Manuel Kayıt' : 'Online'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRes(r)}
                      className="min-h-[44px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-bold"
                    >
                      Detay / İşlem
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual Reservation Modal */}
      <Modal
        isOpen={showManualModal}
        onClose={() => setShowManualModal(false)}
        title="Manuel Rezervasyon Oluştur"
        description="Telefon veya resepsiyondan gelen müşteri için kort ayırtın."
        maxWidth="md"
      >
        <form onSubmit={handleCreateManual} className="space-y-4">
          {manError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
              {manError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="man-court" className="block text-xs font-bold text-slate-700 mb-1">Kort Seçimi</label>
              <select
                id="man-court"
                value={manCourtId}
                onChange={(e) => setManCourtId(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
              >
                {courts.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="man-time" className="block text-xs font-bold text-slate-700 mb-1">Başlama Saati</label>
              <input
                id="man-time"
                type="time"
                value={manTime}
                onChange={(e) => setManTime(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="man-name" className="block text-xs font-bold text-slate-700 mb-1">Müşteri Adı Soyadı</label>
              <input
                id="man-name"
                type="text"
                placeholder="Örn: Ahmet Yılmaz"
                value={manName}
                onChange={(e) => setManName(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label htmlFor="man-phone" className="block text-xs font-bold text-slate-700 mb-1">Müşteri Telefon Numarası</label>
              <input
                id="man-phone"
                type="tel"
                placeholder="0532 000 0000"
                value={manPhone}
                onChange={(e) => setManPhone(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="man-dur" className="block text-xs font-bold text-slate-700 mb-1">Süre (Dakika)</label>
              <select
                id="man-dur"
                value={manDuration}
                onChange={(e) => setManDuration(Number(e.target.value) as any)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
              >
                <option value={60}>60 Dakika</option>
                <option value={90}>90 Dakika</option>
                <option value={120}>120 Dakika</option>
              </select>
            </div>

            <div>
              <label htmlFor="man-payment" className="block text-xs font-bold text-slate-700 mb-1">Ödeme Durumu</label>
              <select
                id="man-payment"
                value={manPayment}
                onChange={(e) => setManPayment(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
              >
                <option value="PAY_AT_VENUE">Tesiste Ödenecek</option>
                <option value="PAID">Tahsil Edildi (Nakit/POS)</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowManualModal(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={manSubmitting}
              className="min-h-[44px] px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors"
            >
              {manSubmitting ? 'Kaydediliyor...' : 'Rezervasyonu Kaydet'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Court Block Modal */}
      <Modal
        isOpen={showBlockModal}
        onClose={() => setShowBlockModal(false)}
        title="Kort Saat Blokajı Oluştur"
        description="Bakım, antrenman veya özel etkinlik sebebiyle kort saatlerini kapatın."
        maxWidth="md"
      >
        <form onSubmit={handleCreateBlock} className="space-y-4">
          {blockError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
              {blockError}
            </div>
          )}

          <div>
            <label htmlFor="blk-court" className="block text-xs font-bold text-slate-700 mb-1">Kort</label>
            <select
              id="blk-court"
              value={blockCourtId}
              onChange={(e) => setBlockCourtId(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
            >
              {courts.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="blk-start" className="block text-xs font-bold text-slate-700 mb-1">Başlangıç Saati</label>
              <input
                id="blk-start"
                type="time"
                value={blockStartTime}
                onChange={(e) => setBlockStartTime(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
              />
            </div>
            <div>
              <label htmlFor="blk-end" className="block text-xs font-bold text-slate-700 mb-1">Bitiş Saati</label>
              <input
                id="blk-end"
                type="time"
                value={blockEndTime}
                onChange={(e) => setBlockEndTime(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
              />
            </div>
          </div>

          <div>
            <label htmlFor="blk-reason" className="block text-xs font-bold text-slate-700 mb-1">Blokaj Sebebi</label>
            <select
              id="blk-reason"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
            >
              <option value="MAINTENANCE">Kort Bakımı & Temizlik</option>
              <option value="TRAINING">Padel Akademi / Antrenman</option>
              <option value="TOURNAMENT">Turnuva / Etkinlik</option>
              <option value="WEATHER">Hava Muhalefeti</option>
            </select>
          </div>

          <div>
            <label htmlFor="blk-note" className="block text-xs font-bold text-slate-700 mb-1">Açıklama / Not</label>
            <input
              id="blk-note"
              type="text"
              placeholder="Örn: Cam temizliği ve çim bakımı"
              value={blockNote}
              onChange={(e) => setBlockNote(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowBlockModal(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-slate-600"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={blockSubmitting}
              className="min-h-[44px] px-6 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
            >
              {blockSubmitting ? 'Kaydediliyor...' : 'Blokajı Uygula'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reservation Detail & Action Modal */}
      <Modal
        isOpen={!!selectedRes}
        onClose={() => setSelectedRes(null)}
        title="Rezervasyon İşlemleri"
        maxWidth="md"
      >
        {selectedRes && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <p className="font-bold text-slate-900 text-sm">{selectedRes.ownerMaskedName}</p>
              <p className="text-slate-600">Telefon: {selectedRes.ownerPhone || 'Kayıtlı değil'}</p>
              <p className="text-slate-600">Saat: {selectedRes.startAt.split('T')[1].slice(0, 5)} ({selectedRes.durationMinutes} Dk)</p>
              <p className="text-slate-600">Tutar: {selectedRes.totalPrice} ₺</p>
              <p className="text-slate-600 font-semibold">
                Ödeme Durumu: {selectedRes.paymentStatus === 'PAID' ? 'Tahsil Edildi' : 'Bekliyor (Tesiste)'}
              </p>
            </div>

            <div className="pt-2">
              <span className="block font-bold text-slate-700 mb-2">Hızlı İşlemler</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handlePaymentChange(selectedRes.id, 'PAID')}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-amber-700" />
                  <span>Tahsil Edildi</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedRes.id, 'NO_SHOW')}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-red-100 hover:bg-red-200 text-red-900 font-bold flex items-center justify-center gap-1.5"
                >
                  <XCircle className="w-4 h-4 text-red-700" />
                  <span>Gelmedi (No-Show)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedRes.id, 'COMPLETED')}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold"
                >
                  Maç Tamamlandı
                </button>

                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedRes.id, 'CANCELLED')}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-red-50 text-red-700 font-bold"
                >
                  İptal Et
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};
