import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// If the backend is hosted on a different domain than this page (e.g. page on Vercel,
// Node server elsewhere), set VITE_API_URL and every "/api/..." call is sent there.
const API_BASE = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/+$/, '');
if (API_BASE && typeof window !== 'undefined') {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      return nativeFetch(API_BASE + input, init);
    }
    return nativeFetch(input, init);
  }) as typeof window.fetch;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error?.message || 'حدث خطأ غير متوقع' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App Error caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070D1D] text-[#E7EBF8] flex flex-col items-center justify-center p-6 text-center font-['IBM_Plex_Sans_Arabic',sans-serif]" dir="rtl">
          <div className="w-16 h-16 rounded-2xl bg-[#3C1D22] text-[#FF9A91] flex items-center justify-center text-2xl mb-4">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-white mb-2">تعذر تحميل شاشة التسميع مؤقتاً</h2>
          <p className="text-xs text-[#9AA7C9] max-w-sm mb-6 leading-relaxed">
            {this.state.errorMessage}
          </p>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.href = '/';
            }}
            className="bg-[#27409E] hover:bg-[#3451B8] text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all cursor-pointer shadow-md"
          >
            إعادة تعيين وتشغيل التطبيق
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
