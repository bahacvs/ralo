import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import { Modal } from '../common/Modal.js';
import { CoverPhotoEditor, CourtPhotosEditor } from '../common/PhotoEditors.js';
import { 
  Plus, Edit2, LayoutGrid, CheckCircle2, XCircle, 
  BarChart3, TrendingUp, Clock, Calendar, Activity, 
  Sparkles, DollarSign, AlertTriangle, Layers
} from 'lucide-react';
import { Court, CourtOccupancyInfo } from '../../types/index.js';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  Tooltip, CartesianGrid, Cell, AreaChart, Area 
} from 'recharts';

interface CourtWithOccupancy extends Court {
  occupancy?: CourtOccupancyInfo & { estimatedDailyRevenue?: number };
}

/** Owner: the club's cover photo shown to players. */
const PanelCoverCard: React.FC = () => {
  const [cover, setCover] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    api.getPanelBusiness().then(res => setCover(res.business.coverImage || null)).catch(() => setCover(null));
  }, []);
  if (cover === undefined) return null;
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5">
      <CoverPhotoEditor endpoint="/api/panel/business/cover" currentUrl={cover} onChanged={setCover} />
    </div>
  );
};

interface AnalyticsData {
  avgOccupancyRate: number;
  totalCourts: number;
  activeCourts: number;
  totalDailyRevenue: number;
  totalBookedHours: number;
  date: string;
  hourlyOccupancy: {
    hour: string;
    activeBookings: number;
    totalCourts: number;
    occupancyRate: number;
  }[];
}

// Color helper for occupancy rate
function getOccupancyColor(rate: number): string {
  if (rate >= 80) return '#ef4444'; // Red/Rose (Kritik / Çok Yoğun)
  if (rate >= 60) return '#f59e0b'; // Amber (Yoğun)
  if (rate >= 35) return '#10b981'; // Emerald (Dengeli / Orta)
  return '#94a3b8'; // Slate (Sakin)
}

function getOccupancyBadgeClass(status?: string): string {
  switch (status) {
    case 'FULL':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'HIGH':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'MODERATE':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export const PanelCourtsView: React.FC = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'ISLETME_SAHIBI';
  const businessId = user?.businessId || '';

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [chartView, setChartView] = useState<'COURTS' | 'HOURLY'>('COURTS');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courts, setCourts] = useState<CourtWithOccupancy[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'OUTDOOR_PANORAMIC' | 'INDOOR' | 'OUTDOOR_STANDARD'>('OUTDOOR_PANORAMIC');
  const [surface, setSurface] = useState('WPT Standart Çim');
  const [pricePerHour, setPricePerHour] = useState('1000');
  const [submitting, setSubmitting] = useState(false);

  const fetchCourts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPanelCourts(businessId, selectedDate);
      setCourts(res.courts);
      if (res.analytics) {
        setAnalytics(res.analytics);
      }
    } catch (err: any) {
      setError(err.message || 'Kortlar ve doluluk verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourts();
  }, [businessId, selectedDate]);

  const handleToggleActive = async (court: Court) => {
    try {
      await api.updatePanelCourt(court.id, { isActive: !court.isActive });
      await fetchCourts();
    } catch (err: any) {
      alert(err.message || 'Kort güncellenemedi.');
    }
  };

  const handleCreateCourt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pricePerHour) return;

    setSubmitting(true);
    try {
      await api.createPanelCourt({
        businessId,
        name,
        type,
        surface,
        pricePerHour: Number(pricePerHour),
        isActive: true
      });
      setShowAddModal(false);
      setName('');
      await fetchCourts();
    } catch (err: any) {
      alert(err.message || 'Kort eklenemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  // Recharts data format for courts bar chart
  const courtChartData = courts.map((c) => ({
    id: c.id,
    name: c.name,
    shortName: c.name.length > 15 ? c.name.slice(0, 13) + '..' : c.name,
    occupancyRate: c.occupancy?.occupancyRate || 0,
    bookedSlots: c.occupancy?.bookedSlotsCount || 0,
    availableSlots: c.occupancy?.availableSlotsCount || 0,
    totalSlots: c.occupancy?.totalSlotsCount || 10,
    status: c.occupancy?.status || 'LOW',
    label: c.occupancy?.label || (c.isActive ? 'Sakin' : 'Pasif'),
    pricePerHour: c.pricePerHour,
    estimatedDailyRevenue: c.occupancy?.estimatedDailyRevenue || 0,
    isActive: c.isActive
  }));

  // Recharts data format for hourly occupancy
  const hourlyChartData = analytics?.hourlyOccupancy || [];

  // Custom Tooltip for Courts Bar Chart
  const CustomCourtTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl border border-slate-800 text-xs space-y-1.5 min-w-[200px]">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
            <span className="font-extrabold text-slate-100 text-sm">{data.name}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              data.occupancyRate >= 80 ? 'bg-rose-950 text-rose-300' :
              data.occupancyRate >= 60 ? 'bg-amber-950 text-amber-300' :
              data.occupancyRate >= 35 ? 'bg-emerald-950 text-emerald-300' :
              'bg-slate-800 text-slate-300'
            }`}>
              {data.label}
            </span>
          </div>

          <div className="flex justify-between items-center text-slate-300">
            <span>Doluluk Oranı:</span>
            <strong className="text-amber-400 font-mono text-sm font-bold">%{data.occupancyRate}</strong>
          </div>
          <div className="flex justify-between items-center text-slate-400 text-[11px]">
            <span>Rezerve Seanslar:</span>
            <span className="font-medium text-slate-200">{data.bookedSlots} / {data.totalSlots} slot</span>
          </div>
          <div className="flex justify-between items-center text-slate-400 text-[11px]">
            <span>Müsait Seanslar:</span>
            <span className="font-medium text-slate-200">{data.availableSlots} slot</span>
          </div>
          <div className="flex justify-between items-center text-slate-400 text-[11px] pt-1 border-t border-slate-800">
            <span>Tahmini Gelir:</span>
            <span className="font-bold text-emerald-400">{data.estimatedDailyRevenue} ₺</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom Tooltip for Hourly Area Chart
  const CustomHourlyTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl border border-slate-800 text-xs space-y-1 min-w-[160px]">
          <span className="font-bold text-amber-400 text-sm block">{data.hour} Seansı</span>
          <div className="flex justify-between text-slate-300">
            <span>Doluluk Oranı:</span>
            <strong className="text-white font-mono font-bold">%{data.occupancyRate}</strong>
          </div>
          <div className="flex justify-between text-slate-400 text-[11px]">
            <span>Dolu Kort Sayısı:</span>
            <span className="text-slate-200 font-semibold">{data.activeBookings} / {data.totalCourts}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const avgRate = analytics?.avgOccupancyRate ?? (
    courts.length > 0 
      ? Math.round(courts.reduce((sum, c) => sum + (c.occupancy?.occupancyRate || 0), 0) / courts.length) 
      : 0
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-serif">
            Kort & Saha Yönetimi
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Tesis sahalarını yönetin, gerçek zamanlı doluluk ve yoğunluk oranlarını inceleyin
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors shadow-xs focus-visible:ring-2 focus-visible:ring-amber-500 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Yeni Kort Ekle</span>
        </button>
      </div>

      {isOwner && <PanelCoverCard />}

      {loading && courts.length === 0 ? (
        <LoadingState message="Kort bilgileri ve doluluk analizleri yükleniyor..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchCourts} />
      ) : (
        <>
          {/* Recharts Occupancy Overview Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-6">
            
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">
                      Saha Doluluk Oranı Analizi
                    </h2>
                    <p className="text-xs text-slate-500">
                      {selectedDate === todayStr ? 'Bugünün' : selectedDate} rezervasyon ve doluluk yoğunluk grafiği
                    </p>
                  </div>
                </div>
              </div>

              {/* Date Filter & Chart View Toggle */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setChartView('COURTS')}
                    className={`min-h-[34px] px-3 rounded-lg text-xs font-bold transition-colors ${
                      chartView === 'COURTS' 
                        ? 'bg-white text-slate-900 shadow-2xs' 
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Kort Bazında
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartView('HOURLY')}
                    className={`min-h-[34px] px-3 rounded-lg text-xs font-bold transition-colors ${
                      chartView === 'HOURLY' 
                        ? 'bg-white text-slate-900 shadow-2xs' 
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Saatlik Dağılım
                  </button>
                </div>

                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
                />
              </div>
            </div>

            {/* Quick Summary Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80">
                <div className="flex items-center justify-between text-amber-900 text-xs font-semibold mb-1">
                  <span>Ortalama Doluluk</span>
                  <Activity className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-950 font-mono">%{avgRate}</span>
                  <span className="text-[11px] font-bold text-amber-700">
                    {avgRate >= 70 ? 'Yüksek' : avgRate >= 40 ? 'Dengeli' : 'Düşük'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between text-slate-600 text-xs font-semibold mb-1">
                  <span>Aktif Saha Sayısı</span>
                  <Layers className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-950 font-mono">
                    {courts.filter(c => c.isActive).length} / {courts.length}
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">kort devrede</span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between text-slate-600 text-xs font-semibold mb-1">
                  <span>Rezerve Edilen Süre</span>
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-950 font-mono">
                    {analytics?.totalBookedHours || courts.reduce((sum, c) => sum + Math.round((c.occupancy?.bookedSlotsCount || 0) * 1.5), 0)}
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">saat / gün</span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80">
                <div className="flex items-center justify-between text-emerald-900 text-xs font-semibold mb-1">
                  <span>Tahmini Günlük Ciro</span>
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-950 font-mono">
                    {analytics?.totalDailyRevenue || courts.reduce((sum, c) => sum + (c.occupancy?.estimatedDailyRevenue || 0), 0)}
                  </span>
                  <span className="text-xs font-extrabold text-emerald-700">₺</span>
                </div>
              </div>
            </div>

            {/* Recharts Chart Canvas */}
            <div className="w-full pt-2">
              <div className="w-full h-[280px]">
                {chartView === 'COURTS' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={courtChartData}
                      margin={{ top: 10, right: 15, left: -10, bottom: 25 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis 
                        dataKey="shortName" 
                        tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                        interval={0}
                      />
                      <YAxis 
                        domain={[0, 100]} 
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        unit="%"
                      />
                      <Tooltip content={<CustomCourtTooltip />} />
                      <Bar 
                        dataKey="occupancyRate" 
                        radius={[8, 8, 2, 2]} 
                        maxBarSize={48}
                      >
                        {courtChartData.map((entry) => (
                          <Cell 
                            key={`cell-${entry.id}`} 
                            fill={getOccupancyColor(entry.occupancyRate)} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={hourlyChartData}
                      margin={{ top: 10, right: 15, left: -10, bottom: 25 }}
                    >
                      <defs>
                        <linearGradient id="occupancyGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis 
                        dataKey="hour" 
                        tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                      />
                      <YAxis 
                        domain={[0, 100]} 
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        unit="%"
                      />
                      <Tooltip content={<CustomHourlyTooltip />} />
                      <Area 
                        type="monotone" 
                        dataKey="occupancyRate" 
                        stroke="#d97706" 
                        strokeWidth={2.5}
                        fillOpacity={1} 
                        fill="url(#occupancyGradient)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Chart Legend / Guide */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-md bg-slate-400" />
                    <span className="text-slate-600 font-medium">Sakin (&lt;%35)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-md bg-emerald-500" />
                    <span className="text-slate-600 font-medium">Dengeli (%35 - %60)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-md bg-amber-500" />
                    <span className="text-slate-600 font-medium">Yoğun Talep (%60 - %80)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-md bg-rose-500" />
                    <span className="text-slate-600 font-medium">Kritik / Dolu (≥%80)</span>
                  </div>
                </div>

                <span className="text-[11px] text-slate-400">
                  Otomatik yenilenen canlı rezervasyon verisi
                </span>
              </div>
            </div>

          </div>

          {/* Section Divider / Title for Cards Grid */}
          <div className="pt-2 flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900">
              Kayıtlı Kortlar ({courts.length})
            </h2>
            <span className="text-xs text-slate-500 font-medium">
              Kort aktifliğini veya durumunu doğrudan değiştirebilirsiniz
            </span>
          </div>

          {/* Court Cards Grid with Individual Occupancy Progress */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {courts.map((court) => {
              const occ = court.occupancy;
              const rate = occ?.occupancyRate ?? 0;

              return (
                <div
                  key={court.id}
                  className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs p-5 space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">{court.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {court.type === 'OUTDOOR_PANORAMIC' ? 'Açık Panoramik' : court.type === 'INDOOR' ? 'Kapalı Kort' : 'Açık Standart'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(court)}
                        className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                          court.isActive ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {court.isActive ? 'Aktif' : 'Pasif'}
                      </button>
                    </div>

                    {/* Court Specs Box */}
                    <div className="space-y-1 text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl">
                      <div className="flex justify-between">
                        <span>Zemin Tipi:</span>
                        <span className="font-semibold text-slate-900">{court.surface}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Saatlik Fiyat:</span>
                        <span className="font-extrabold text-slate-900 text-sm">{court.pricePerHour} ₺</span>
                      </div>
                    </div>

                    {/* Court Occupancy Progress Bar & Indicator */}
                    <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-600">Günlük Doluluk:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-slate-900 font-mono">%{rate}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getOccupancyBadgeClass(occ?.status)}`}>
                            {occ?.label || (court.isActive ? 'Sakin' : 'Pasif')}
                          </span>
                        </div>
                      </div>

                      {/* Visual bar */}
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${rate}%`,
                            backgroundColor: getOccupancyColor(rate)
                          }}
                        />
                      </div>

                      <div className="flex justify-between text-[11px] text-slate-500 pt-0.5">
                        <span>Dolu: {occ?.bookedSlotsCount ?? 0} seans</span>
                        <span>Müsait: {occ?.availableSlotsCount ?? 0} seans</span>
                      </div>
                    </div>
                  </div>

                  <details>
                    <summary className="text-xs font-bold text-slate-700 cursor-pointer min-h-[32px] flex items-center">Fotoğraflar</summary>
                    <div className="pt-2">
                      <CourtPhotosEditor endpoint={`/api/panel/courts/${court.id}/photos`} canEdit={isOwner} />
                    </div>
                  </details>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-[11px] text-slate-400 font-mono">ID: {court.id}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(court)}
                      className="text-xs font-bold text-slate-700 hover:text-slate-950 min-h-[44px] px-2 flex items-center cursor-pointer"
                    >
                      {court.isActive ? 'Kortu Kapat' : 'Kortu Aç'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add Court Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Yeni Padel Kortu Tanımla"
        description="Tesis bünyesine yeni bir kort ekleyin."
        maxWidth="md"
      >
        <form onSubmit={handleCreateCourt} className="space-y-4">
          <div>
            <label htmlFor="court-name" className="block text-xs font-bold text-slate-700 mb-1">Kort Adı</label>
            <input
              id="court-name"
              type="text"
              placeholder="Örn: Kort 4 (Açık Panoramik)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold"
            />
          </div>

          <div>
            <label htmlFor="court-type" className="block text-xs font-bold text-slate-700 mb-1">Kort Tipi</label>
            <select
              id="court-type"
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold"
            >
              <option value="OUTDOOR_PANORAMIC">Açık Panoramik (WPT 12mm Cam)</option>
              <option value="INDOOR">Kapalı Kort (İklimlendirilmiş)</option>
              <option value="OUTDOOR_STANDARD">Açık Standart</option>
            </select>
          </div>

          <div>
            <label htmlFor="court-price" className="block text-xs font-bold text-slate-700 mb-1">Saatlik Kira Bedeli (₺)</label>
            <input
              id="court-price"
              type="number"
              value={pricePerHour}
              onChange={(e) => setPricePerHour(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-slate-600 cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors cursor-pointer"
            >
              {submitting ? 'Ekleniyor...' : 'Kortu Kaydet'}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
};
