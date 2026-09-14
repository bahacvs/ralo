import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import { Modal } from '../common/Modal.js';
import { Plus, Users, Shield, Check, Phone } from 'lucide-react';

interface StaffItem {
  id: string;
  businessId: string;
  displayName: string;
  phone: string;
  role: 'OWNER' | 'MANAGER' | 'RECEPTION';
  permissions: string[];
}

export const PanelStaffView: React.FC = () => {
  const { user } = useAuth();
  const businessId = user?.businessId || 'biz_urla';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<StaffItem[]>([]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'MANAGER' | 'RECEPTION'>('RECEPTION');
  const [submitting, setSubmitting] = useState(false);

  const fetchStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPanelStaff(businessId);
      setStaffList(res.staff);
    } catch (err: any) {
      setError(err.message || 'Personel listesi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [businessId]);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    setSubmitting(true);
    try {
      await api.createPanelStaff({
        businessId,
        displayName: name,
        phone,
        role,
        permissions: role === 'MANAGER'
          ? ['RESERVATIONS_WRITE', 'PAYMENTS_WRITE', 'BLOCKS_WRITE', 'STAFF_MANAGE']
          : ['RESERVATIONS_WRITE', 'PAYMENTS_WRITE', 'BLOCKS_WRITE']
      });
      setShowAddModal(false);
      setName('');
      setPhone('');
      await fetchStaff();
    } catch (err: any) {
      alert(err.message || 'Personel eklenemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-serif">
            Personel & Yetkilendirme
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Tesis personellerini ve yetki sınırlarını yönetin
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors shadow-xs focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <Plus className="w-4 h-4" />
          <span>Personel Yetkilendir</span>
        </button>
      </div>

      {loading ? (
        <LoadingState message="Personel listesi getiriliyor..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchStaff} />
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="divide-y divide-slate-100">
            {staffList.map((member) => (
              <div key={member.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-800 flex items-center justify-center font-bold">
                    {member.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">{member.displayName}</h2>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{member.userPhone}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    member.role === 'OWNER'
                      ? 'bg-amber-100 text-amber-900'
                      : member.role === 'MANAGER'
                      ? 'bg-blue-100 text-blue-900'
                      : 'bg-amber-50 text-amber-900 border border-amber-200'
                  }`}>
                    {member.role === 'OWNER' ? 'İşletme Sahibi' : member.role === 'MANAGER' ? 'Tesis Müdürü' : 'Resepsiyon'}
                  </span>

                  <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg">
                    <Shield className="w-3.5 h-3.5 text-slate-400" />
                    <span>{member.permissions.length} Yetki Tanımlı</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Yeni Personel Ekle"
        description="Personele resepsiyon veya yöneticilik yetkisi verin."
        maxWidth="md"
      >
        <form onSubmit={handleAddStaff} className="space-y-4">
          <div>
            <label htmlFor="staff-name" className="block text-xs font-bold text-slate-700 mb-1">Personel Adı Soyadı</label>
            <input
              id="staff-name"
              type="text"
              placeholder="Örn: Ece Çetin"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold"
            />
          </div>

          <div>
            <label htmlFor="staff-phone" className="block text-xs font-bold text-slate-700 mb-1">Telefon Numarası</label>
            <input
              id="staff-phone"
              type="tel"
              placeholder="0532 999 8877"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold"
            />
          </div>

          <div>
            <label htmlFor="staff-role" className="block text-xs font-bold text-slate-700 mb-1">Rol / Yetki Kapsamı</label>
            <select
              id="staff-role"
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold"
            >
              <option value="RECEPTION">Resepsiyonist (Rezervasyon ve Tahsilat)</option>
              <option value="MANAGER">Tesis Müdürü (Tam Yetki)</option>
            </select>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-slate-600"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors"
            >
              {submitting ? 'Ekleniyor...' : 'Yetkilendir'}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
};
