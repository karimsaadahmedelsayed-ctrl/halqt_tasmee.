import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone } from 'lucide-react';

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed and running standalone, do not show
  if (isInstalled) {
    return null;
  }

  // Android / Chrome / Edge flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        type="button"
        className={`flex items-center gap-2 rounded-xl bg-[#27409E] hover:bg-[#3451B8] text-white px-3.5 py-2 text-xs font-semibold shadow-md transition-all cursor-pointer active:scale-95 ${className}`}
      >
        <Download className="w-4 h-4 shrink-0 text-[#8CA2FF]" />
        <span>تثبيت التطبيق على الهاتف مجاناً</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          type="button"
          className={`flex items-center gap-2 rounded-xl bg-[#1C2E58] hover:bg-[#273D72] text-[#E7EBF8] border border-[#27325A] px-3.5 py-2 text-xs font-semibold shadow-sm transition-all cursor-pointer ${className}`}
        >
          <Smartphone className="w-4 h-4 shrink-0 text-[#8CA2FF]" />
          <span>تثبيت على الآيفون / الآيباد</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 font-['IBM_Plex_Sans_Arabic',sans-serif]" dir="rtl">
            <div className="w-full max-w-sm rounded-2xl bg-[#121A33] border border-[#27325A] p-6 shadow-2xl text-right">
              <h3 className="text-base font-bold text-white mb-2">تثبيت التطبيق على آيفون / آيباد</h3>
              <p className="text-xs text-[#9AA7C9] leading-relaxed mb-4">
                1. اضغط على زر <strong>المشاركة (Share)</strong> في شريط متصفح Safari.<br />
                2. مرر للأسفل واختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-[#27409E] hover:bg-[#3451B8] py-2 text-xs font-semibold text-white cursor-pointer transition-all"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
