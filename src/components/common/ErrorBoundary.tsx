import React from 'react';
import { reportClientError } from '../../services/errorReporting.js';

interface State {
  failed: boolean;
}

/** Shows a recovery screen instead of a blank page when a screen crashes, and reports the error. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  declare props: Readonly<{ children: React.ReactNode }>;
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportClientError(error.message, `${error.stack ?? ''}\n${info.componentStack ?? ''}`);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm text-center space-y-3 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
          <h1 className="text-lg font-black text-slate-900">Bir şeyler ters gitti</h1>
          <p className="text-sm text-slate-600">
            Sayfa beklenmedik bir hatayla karşılaştı; hata ekibimize iletildi. Uygulama yeni bir sürüme güncellenmiş olabilir,
            sayfayı yenilemek genellikle sorunu çözer.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-[44px] px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-black cursor-pointer"
          >
            Sayfayı Yenile
          </button>
        </div>
      </div>
    );
  }
}
