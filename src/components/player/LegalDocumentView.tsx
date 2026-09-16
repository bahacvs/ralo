import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../services/api.js';
import { LoadingState, ErrorState } from '../common/StateViews.js';
import { LegalMarkdown } from '../common/LegalMarkdown.js';
import { ArrowLeft } from 'lucide-react';

export const LegalDocumentView: React.FC = () => {
  const { currentRoute, navigate } = useAuth();
  const slug = currentRoute.split('/')[2] ?? '';
  const [doc, setDoc] = useState<{ title: string; version: string; publishedAt: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setDoc(null);
    try {
      setDoc((await api.getLegalDocument(slug)).document);
    } catch (err: any) {
      setError(err.message || 'Belge yüklenemedi.');
    }
  };

  useEffect(() => {
    load();
  }, [slug]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!doc) return <LoadingState message="Belge yükleniyor..." />;

  return (
    <article className="max-w-3xl mx-auto space-y-4 pb-12">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? window.history.back() : navigate('/ana'))}
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>Geri</span>
      </button>
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs">
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">
          {doc.title} · Sürüm {doc.version} · Yayın: {new Date(doc.publishedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <LegalMarkdown content={doc.content} />
      </div>
    </article>
  );
};
