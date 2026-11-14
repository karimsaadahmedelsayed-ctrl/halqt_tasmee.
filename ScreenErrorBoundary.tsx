import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ScreenErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Screen Error caught by ScreenErrorBoundary:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center font-['IBM_Plex_Sans_Arabic',sans-serif]" dir="rtl">
          <div className="w-16 h-16 rounded-2xl bg-[#3C1D22] border border-[#B3261E]/40 text-[#FF9A91] flex items-center justify-center text-2xl mb-4 shadow-lg">
            <AlertCircle className="w-8 h-8" />
          </div>

          <h2 className="text-lg font-bold text-white mb-2">
            {this.props.fallbackTitle || 'تعذر تحميل شاشة الجلسة مؤقتاً'}
          </h2>

          <p className="text-xs text-[#9AA7C9] max-w-md mb-6 leading-relaxed">
            تم رصد انقطاع أو استثناء في قنوات الاتصال. يمكنك إعادة المحاولة فوراً دون فقدان بيانات الحساب.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="flex items-center gap-2 bg-[#27409E] hover:bg-[#3451B8] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow-md active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة المحاولة والمتابعة</span>
            </button>

            {this.props.onReset && (
              <button
                type="button"
                onClick={this.props.onReset}
                className="flex items-center gap-2 bg-[#142347] hover:bg-[#1B2F5C] text-[#8CA2FF] text-xs font-semibold px-4 py-2.5 rounded-xl border border-[#273860] transition-all cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>العودة للساحة الرئيسية</span>
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
