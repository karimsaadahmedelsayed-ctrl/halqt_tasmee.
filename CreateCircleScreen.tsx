import React, { useState, useEffect } from 'react';
import { UserSession, CircleRoom } from '../types';
import { ArrowLeft, Copy, Check, Plus, X, Link2, LogOut, Users } from 'lucide-react';
import { toArabicNumerals } from '../utils/tasmeeEngine';

interface CreateCircleScreenProps {
  user: UserSession;
  onLogout?: () => void;
  onLaunchCircle: (circle: CircleRoom) => void;
  statusMessage?: string;
}

export const CreateCircleScreen: React.FC<CreateCircleScreenProps> = ({
  user,
  onLogout,
  onLaunchCircle,
  statusMessage
}) => {
  const [circleName, setCircleName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [roomId] = useState(() => 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
  const [savedCircles, setSavedCircles] = useState<CircleRoom[]>([]);
  const [loadingSavedCircles, setLoadingSavedCircles] = useState(true);

  // Load all circles this user created or joined
  useEffect(() => {
    if (!user?.email) return;
    fetch(`/api/user/circles?email=${encodeURIComponent(user.email)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.circles)) {
          setSavedCircles(data.circles);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSavedCircles(false));
  }, [user?.email]);

  // Direct join invite link
  const inviteLink = typeof window !== 'undefined'
    ? `${window.location.origin}/?join=${roomId}&circle=${encodeURIComponent(circleName.trim() || 'حلقة القرآن الكريم')}`
    : '';

  const handleCopyLink = () => {
    if (!inviteLink) return;
    try {
      navigator.clipboard.writeText(inviteLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  const handleAddEmail = async () => {
    setErrorText(null);
    const raw = emailInput.trim().toLowerCase();
    if (!raw) return;

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
    const target = isEmail ? raw : `${raw.replace(/\s+/g, '.')}@gmail.com`;

    if (target === user.email.toLowerCase()) {
      setErrorText('أنت مضاف كمنشئ للحلقة تلقائياً.');
      setEmailInput('');
      return;
    }

    if (invitedEmails.includes(target)) {
      setErrorText('هذا البريد مضاف مسبقاً.');
      setEmailInput('');
      return;
    }

    try {
      const res = await fetch('/api/validate-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target })
      });
      const data = await res.json();
      if (!data.registered) {
        setErrorText('هذا الحساب غير مسجل في تطبيق حلقة تسميع.');
        return;
      }
    } catch {
      // ignore
    }

    setInvitedEmails(prev => [...prev, target]);
    setEmailInput('');
  };

  const handleRemoveEmail = (email: string) => {
    setInvitedEmails(prev => prev.filter(e => e !== email));
  };

  const isNameValid = circleName.trim().length > 0;

  const handleLaunch = async () => {
    if (!isNameValid || isLaunching) return;
    setIsLaunching(true);
    setLaunchError(null);

    // Same id as the invite link, so the link always points at the circle saved on the server
    const generatedId = roomId;

    try {
      const res = await fetch('/api/circles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: generatedId,
          name: circleName.trim(),
          creatorEmail: user.email,
          creatorName: user.name,
          members: invitedEmails
        })
      });

      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        if (data.success && data.circle) {
          const serverCircle: CircleRoom = {
            id: data.circle.id,
            name: data.circle.name,
            surahNumber: 2,
            creatorEmail: data.circle.creatorEmail,
            creatorName: data.circle.creatorName,
            members: data.circle.members,
            createdAt: data.circle.createdAt
          };
          onLaunchCircle(serverCircle);
          return;
        }
      }

      // Server answered but did not save the circle
      let serverMsg = '';
      try {
        const errData = await res.clone().json();
        serverMsg = errData?.message || '';
      } catch {}
      setLaunchError(serverMsg || 'تعذر حفظ الحلقة على الخادم. لم يتم إنشاؤها، حاول مرة أخرى.');
    } catch {
      setLaunchError('تعذر الاتصال بالخادم، لم يتم حفظ الحلقة. تحقق من الإنترنت وحاول مرة أخرى.');
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070D1D] text-[#E7EBF8] flex flex-col font-['IBM_Plex_Sans_Arabic',sans-serif] select-none">
      
      {/* Top Header: Sleek, minimal, zero clutter */}
      <header className="bg-[#0A1428] border-b border-[#162544] px-4 py-3 sticky top-0 z-10 shadow-sm">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#1C2E58] border border-[#2A4582] text-[#8CA2FF] flex items-center justify-center font-bold text-xs">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="font-semibold text-xs sm:text-sm text-white">
              {user.name}
            </span>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="text-[11px] text-[#FF9A91] hover:text-white bg-[#301418] hover:bg-[#A82537] px-2 py-0.5 rounded-lg mr-1 transition-all cursor-pointer"
                title="تسجيل الخروج"
              >
                خروج
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs font-bold text-[#8CA2FF]">
            <span className="text-sm">📖</span>
            <span>حلقة تسميع</span>
          </div>
        </div>
      </header>

      {/* Main Content: Focused, minimal card */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 max-w-md mx-auto w-full gap-4">
        
        {/* Saved Circles List (if user is creator or member of previous groups) */}
        {savedCircles.length > 0 && (
          <div className="bg-[#0C1730] border border-[#192D5A] rounded-2xl w-full p-4 sm:p-5 shadow-xl space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-right border-b border-[#16274D] pb-2">
              <span className="text-sm font-bold text-white flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#8CA2FF]" />
                <span>حلقاتك ومجموعاتك المحفوظة دائماً</span>
              </span>
              <span className="text-[11px] font-semibold text-[#6FD39A] bg-[#122A22] border border-[#23583C] px-2.5 py-0.5 rounded-full">
                {toArabicNumerals(savedCircles.length)} حلقات
              </span>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
              {savedCircles.map((sc) => (
                <div
                  key={sc.id}
                  className="bg-[#081124] border border-[#1C3366] hover:border-[#8CA2FF]/60 rounded-xl p-3 flex items-center justify-between gap-2 text-right transition-all group"
                >
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-[#8CA2FF] transition-colors">
                      {sc.name}
                    </h3>
                    <p className="text-[10px] text-[#7A8EBA]">
                      {sc.creatorEmail === user.email ? 'أنت المنشئ' : `المنشئ: ${sc.creatorName || sc.creatorEmail}`} • {toArabicNumerals(sc.members?.length || 1)} أعضاء
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onLaunchCircle(sc)}
                    className="bg-[#1C2C55] hover:bg-[#25396D] active:bg-[#18264A] text-[#8CA2FF] hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 shadow-xs active:scale-95"
                  >
                    دخول للمجموعة ❯
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Creation Card */}
        <div className="bg-[#0C1730] border border-[#192D5A] rounded-2xl w-full p-6 shadow-2xl space-y-5">
          
          {/* Card Title */}
          <div className="text-right space-y-1">
            <h1 className="text-xl font-bold text-white tracking-wide">
              {savedCircles.length > 0 ? 'إنشاء حلقة جديدة إضافية' : 'إنشاء حلقة جديدة'}
            </h1>
            <p className="text-xs text-[#7A8EBA]">
              أنشئ حلقتك وادخل مباشرة للمجموعة مع إمكانية مشاركة الرابط
            </p>
          </div>

          {statusMessage && (
            <div className="bg-[#14264C] text-[#8CA2FF] text-xs p-2.5 rounded-xl border border-[#203D78] text-right">
              {statusMessage}
            </div>
          )}

          {/* Circle Name Input */}
          <div className="space-y-1.5 text-right">
            <input
              type="text"
              autoFocus
              value={circleName}
              onChange={(e) => setCircleName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && isNameValid && handleLaunch()}
              placeholder="اسم الحلقة (مثال: حلقة الفجر، مراجعة جزء عمّ)..."
              className="w-full bg-[#081124] border border-[#1C3366] rounded-xl px-4 py-3 text-sm text-white placeholder-[#5A6F9E] text-right focus:outline-none focus:border-[#8CA2FF] transition-all"
            />
          </div>

          {/* Official Creation Note */}
          <div className="bg-[#081124] border border-[#16274D] rounded-xl p-3 flex items-center justify-between gap-2 text-right">
            <div className="text-xs text-[#7A8EBA] space-y-0.5">
              <span className="text-[#A6BAE6] font-medium block">
                رابط الدعوة المباشر
              </span>
              <span className="text-[11px] text-[#6E82AE] block">
                يُفعّل الرابط تلقائياً بمجرد إنشاء المجموعة على الخادم، وستتمكن من نسخه ومشاركته للأعضاء من داخل شاشة الحلقة.
              </span>
            </div>
            <Link2 className="w-5 h-5 text-[#8CA2FF] shrink-0" />
          </div>

          {/* Optional: Add members toggle */}
          <div className="pt-0.5 text-right">
            {!showAddMembers ? (
              <button
                type="button"
                onClick={() => setShowAddMembers(true)}
                className="text-xs text-[#8CA2FF] hover:text-[#B2C2FF] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة أعضاء محددين مسبقاً (اختياري)</span>
              </button>
            ) : (
              <div className="space-y-2 animate-in fade-in duration-200">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      if (errorText) setErrorText(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
                    placeholder="بريد الحافظ (مثال: user@gmail.com)"
                    dir="ltr"
                    className="flex-1 bg-[#081124] border border-[#1C3366] rounded-xl px-3 py-2 text-xs text-white text-left focus:outline-none focus:border-[#8CA2FF]"
                  />
                  <button
                    type="button"
                    onClick={handleAddEmail}
                    className="bg-[#1C2E58] hover:bg-[#27407D] text-[#8CA2FF] px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
                  >
                    أضف
                  </button>
                </div>

                {errorText && (
                  <p className="text-[11px] text-[#FF9A91]">{errorText}</p>
                )}

                {invitedEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {invitedEmails.map(email => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 bg-[#122247] border border-[#1E376E] text-[11px] px-2 py-0.5 rounded-lg text-[#8CA2FF]"
                      >
                        <span dir="ltr">{email.split('@')[0]}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveEmail(email)}
                          className="hover:text-white cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            disabled={!isNameValid || isLaunching}
            onClick={handleLaunch}
            className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 ${
              isNameValid && !isLaunching
                ? 'bg-[#8CA2FF] hover:bg-[#A3B5FF] text-[#0A1230] shadow-md cursor-pointer active:scale-98'
                : 'bg-[#152342] text-[#4F648E] cursor-not-allowed opacity-70'
            }`}
          >
            {isLaunching ? (
              <div className="w-5 h-5 border-2 border-[#0A1230] border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>أنشئ الحلقة وادخل للمجموعة</span>
                <ArrowLeft className="w-4 h-4" />
              </>
            )}
          </button>

          {launchError && (
            <p role="alert" className="text-xs text-[#FF9A91] bg-[#3C1D22] border border-[#B3261E]/30 rounded-xl p-3 text-right leading-relaxed">
              {launchError}
            </p>
          )}
        </div>
      </main>
    </div>
  );
};
