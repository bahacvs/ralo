import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api.js';
import { resizeImageForUpload } from '../../services/image.js';
import { ImagePlus, Trash2 } from 'lucide-react';

type Photo = { id: string; url: string; isPrimary: boolean };
type Feedback = { tone: 'success' | 'error'; text: string } | null;

const buttonClass = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold cursor-pointer disabled:opacity-50';

/** Hidden file input + button; resizes the chosen photo before handing it over. */
const PickPhotoButton: React.FC<{ label: string; disabled?: boolean; onPicked: (dataUrl: string) => void; onError: (message: string) => void }> = ({ label, disabled, onPicked, onError }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={async e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            onPicked(await resizeImageForUpload(file));
          } catch (err: any) {
            onError(err.message || 'Fotoğraf hazırlanamadı.');
          }
        }}
      />
      <button type="button" className={buttonClass} disabled={disabled} onClick={() => inputRef.current?.click()}>
        <ImagePlus className="w-4 h-4" aria-hidden="true" /> {label}
      </button>
    </>
  );
};

const FeedbackLine: React.FC<{ busy: boolean; message: Feedback }> = ({ busy, message }) => (
  <>
    {busy && <p className="text-[11px] text-slate-500" role="status">Yükleniyor...</p>}
    {message && (
      <p role={message.tone === 'error' ? 'alert' : 'status'} className={`text-[11px] font-semibold ${message.tone === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>
        {message.text}
      </p>
    )}
  </>
);

interface CoverProps {
  /** '/api/panel/business/cover' or '/api/admin/clubs/<id>/cover' */
  endpoint: string;
  currentUrl: string | null;
  onChanged?: (url: string | null) => void;
}

export const CoverPhotoEditor: React.FC<CoverProps> = ({ endpoint, currentUrl, onChanged }) => {
  const [url, setUrl] = useState(currentUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Feedback>(null);

  useEffect(() => setUrl(currentUrl), [currentUrl]);

  const run = async (action: () => Promise<{ url: string | null; message: string }>) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await action();
      setUrl(res.url);
      onChanged?.(res.url);
      setMessage({ tone: 'success', text: res.message });
    } catch (err: any) {
      setMessage({ tone: 'error', text: err.message || 'İşlem tamamlanamadı.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-slate-700">Kapak fotoğrafı</p>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="w-full sm:w-48 aspect-video rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
          {url ? <img src={url} alt="Kulüp kapak fotoğrafı" className="w-full h-full object-cover" /> : <span className="text-[11px] text-slate-500">Kapak yok</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <PickPhotoButton
            label={url ? 'Değiştir' : 'Fotoğraf Yükle'}
            disabled={busy}
            onError={text => setMessage({ tone: 'error', text })}
            onPicked={image => run(() => api.uploadImage(endpoint, image))}
          />
          {url && (
            <button type="button" className={buttonClass} disabled={busy} onClick={() => run(() => api.deleteImage(endpoint))}>
              <Trash2 className="w-4 h-4" aria-hidden="true" /> Kaldır
            </button>
          )}
        </div>
      </div>
      <FeedbackLine busy={busy} message={message} />
    </div>
  );
};

interface CourtPhotosProps {
  /** '/api/panel/courts/<courtId>/photos' or '/api/admin/clubs/<id>/courts/<courtId>/photos' */
  endpoint: string;
  canEdit?: boolean;
}

export const CourtPhotosEditor: React.FC<CourtPhotosProps> = ({ endpoint, canEdit = true }) => {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Feedback>(null);

  useEffect(() => {
    api.listCourtPhotos(endpoint)
      .then(res => setPhotos(res.photos))
      .catch((err: any) => setMessage({ tone: 'error', text: err.message || 'Fotoğraflar yüklenemedi.' }));
  }, [endpoint]);

  const run = async (action: () => Promise<{ photos: Photo[]; message: string }>) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await action();
      setPhotos(res.photos);
      setMessage({ tone: 'success', text: res.message });
    } catch (err: any) {
      setMessage({ tone: 'error', text: err.message || 'İşlem tamamlanamadı.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {photos === null ? (
        <p className="text-[11px] text-slate-500">Fotoğraflar yükleniyor...</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {photos.map(photo => (
            <div key={photo.id} className="relative w-24 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
              <img src={photo.url} alt="Kort fotoğrafı" className="w-full h-full object-cover" />
              {photo.isPrimary && <span className="absolute bottom-0.5 left-0.5 text-[9px] font-bold bg-amber-500 text-slate-950 px-1 rounded">Kapak</span>}
              {canEdit && (
                <button
                  type="button"
                  disabled={busy}
                  aria-label="Fotoğrafı sil"
                  onClick={() => { if (window.confirm('Bu fotoğraf silinsin mi?')) run(() => api.deleteCourtPhoto(endpoint, photo.id)); }}
                  className="absolute top-0.5 right-0.5 w-7 h-7 rounded-lg bg-white/90 text-red-700 flex items-center justify-center cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          {photos.length === 0 && <p className="text-[11px] text-slate-500">Bu kortun fotoğrafı yok.</p>}
        </div>
      )}
      {canEdit && photos !== null && photos.length < 6 && (
        <PickPhotoButton
          label="Fotoğraf Ekle"
          disabled={busy}
          onError={text => setMessage({ tone: 'error', text })}
          onPicked={image => run(() => api.addCourtPhoto(endpoint, image))}
        />
      )}
      <FeedbackLine busy={busy} message={message} />
    </div>
  );
};
