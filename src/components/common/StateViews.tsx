import React from 'react';
import { Loader2, AlertTriangle, SearchX, RefreshCw } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ 
  message = 'Veriler yükleniyor, lütfen bekleyin...' 
}) => {
  return (
    <div 
      className="flex flex-col items-center justify-center py-12 px-4 text-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-3" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-700">{message}</p>
      <span className="sr-only">Yükleniyor</span>
    </div>
  );
};

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  icon
}) => {
  return (
    <div 
      className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-slate-200/80 my-4 shadow-sm"
      role="region"
      aria-label={title}
    >
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-3" aria-hidden="true">
        {icon || <SearchX className="w-6 h-6" />}
      </div>
      <h3 className="text-base font-bold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-600 max-w-sm mb-4 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 cursor-pointer shadow-xs"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Bir sorun oluştu',
  message,
  onRetry
}) => {
  return (
    <div 
      className="flex flex-col items-center justify-center p-8 text-center bg-red-50/50 rounded-2xl border border-red-200 my-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-700 mb-3" aria-hidden="true">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h3 className="text-base font-bold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-600 max-w-md mb-4 leading-relaxed">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          <span>Tekrar Dene</span>
        </button>
      )}
    </div>
  );
};
