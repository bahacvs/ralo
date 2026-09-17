import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import type { ClubReviewsResponse } from '../../types/reviews.js';
import { Star, Trash2 } from 'lucide-react';

interface Props {
  clubId: string;
  /** Platform admin view: remove any review, no own-review form. */
  adminMode?: boolean;
}

const Stars: React.FC<{ value: number; size?: string }> = ({ value, size = 'w-3.5 h-3.5' }) => (
  <span className="inline-flex" aria-label={`${value} / 5 yıldız`}>
    {[1, 2, 3, 4, 5].map(n => (
      <Star key={n} className={`${size} ${n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} aria-hidden="true" />
    ))}
  </span>
);

export const ClubReviews: React.FC<Props> = ({ clubId, adminMode = false }) => {
  const { user, navigate, setReturnTo, currentRoute } = useAuth();
  const [data, setData] = useState<ClubReviewsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const apply = (res: ClubReviewsResponse) => {
    setData(res);
    setRating(res.viewer?.myReview?.rating ?? 0);
    setComment(res.viewer?.myReview?.comment ?? '');
  };

  const load = async () => {
    setError(null);
    try {
      apply(await api.getClubReviews(clubId));
    } catch (err: any) {
      setError(err.message || 'Değerlendirmeler yüklenemedi.');
    }
  };

  useEffect(() => {
    if (clubId) load();
  }, [clubId, user?.id]);

  const run = async (action: () => Promise<ClubReviewsResponse & { message: string }>) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await action();
      apply(res);
      setMessage({ tone: 'success', text: res.message });
    } catch (err: any) {
      setMessage({ tone: 'error', text: err.message || 'İşlem tamamlanamadı.' });
    } finally {
      setBusy(false);
    }
  };

  const removeAsAdmin = async (reviewId: string) => {
    if (!window.confirm('Bu değerlendirme kaldırılsın mı? İşlem denetim kaydına yazılır.')) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.adminDeleteReview(reviewId);
      setMessage({ tone: 'success', text: res.message });
      await load();
    } catch (err: any) {
      setMessage({ tone: 'error', text: err.message || 'Değerlendirme kaldırılamadı.' });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="text-xs text-red-700">{error}</p>;
  if (!data) return null;

  const { summary, reviews, viewer } = data;

  return (
    <section aria-labelledby={`reviews-${clubId}`} className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`reviews-${clubId}`} className="text-base font-bold text-slate-900 dark:text-white">Kulüp Değerlendirmeleri</h2>
        {summary.count > 0 ? (
          <div className="flex items-center gap-2 text-sm">
            <strong className="text-2xl font-black text-slate-900 dark:text-white">{summary.average?.toFixed(1)}</strong>
            <Stars value={summary.average ?? 0} size="w-4 h-4" />
            <span className="text-xs text-slate-500">({summary.count})</span>
          </div>
        ) : (
          <span className="text-xs text-slate-500">Henüz değerlendirme yok</span>
        )}
      </div>

      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`text-xs font-semibold ${message.tone === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>
          {message.text}
        </p>
      )}

      {!adminMode && (
        !user ? (
          <button
            type="button"
            onClick={() => { setReturnTo(currentRoute); navigate('/giris'); }}
            className="text-xs font-bold text-amber-700 dark:text-amber-400 underline cursor-pointer"
          >
            Değerlendirme yapmak için giriş yapın
          </button>
        ) : viewer?.canReview ? (
          <form
            className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 space-y-3"
            onSubmit={e => {
              e.preventDefault();
              if (rating < 1) {
                setMessage({ tone: 'error', text: 'Lütfen 1 ile 5 arasında yıldız seçin.' });
                return;
              }
              run(() => api.saveClubReview(clubId, rating, comment));
            }}
          >
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{viewer.myReview ? 'Değerlendirmeniz' : 'Bu kulübü değerlendirin'}</p>
            <div role="radiogroup" aria-label="Puan" className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} yıldız`}
                  onClick={() => setRating(n)}
                  className="p-1 min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
                >
                  <Star className={`w-6 h-6 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} aria-hidden="true" />
                </button>
              ))}
            </div>
            <label htmlFor={`review-comment-${clubId}`} className="sr-only">Yorum</label>
            <textarea
              id={`review-comment-${clubId}`}
              rows={3}
              maxLength={1000}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Kortlar, ışıklandırma, soyunma odaları, personel... (isteğe bağlı)"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <div className="flex flex-wrap justify-end gap-2">
              {viewer.myReview && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { if (window.confirm('Değerlendirmeniz silinsin mi?')) run(() => api.deleteMyClubReview(clubId)); }}
                  className="min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-50"
                >
                  Sil
                </button>
              )}
              <button type="submit" disabled={busy} className="min-h-[40px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black cursor-pointer disabled:opacity-50">
                {viewer.myReview ? 'Güncelle' : 'Gönder'}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-xs text-slate-500">Bu kulüpte oynadıktan sonra değerlendirme yapabilirsiniz.</p>
        )
      )}

      {reviews.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {reviews.map(review => (
            <li key={review.id} className="py-3 flex gap-3">
              <img
                src={review.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                alt=""
                className="w-9 h-9 rounded-xl object-cover shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{review.userMaskedName}</span>
                  <Stars value={review.rating} />
                  <span className="text-[11px] text-slate-500">{new Date(review.updatedAt).toLocaleDateString('tr-TR')}</span>
                </div>
                {review.comment && <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 whitespace-pre-line break-words">{review.comment}</p>}
              </div>
              {adminMode && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeAsAdmin(review.id)}
                  aria-label="Değerlendirmeyi kaldır"
                  className="shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-red-700 hover:bg-red-50 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
