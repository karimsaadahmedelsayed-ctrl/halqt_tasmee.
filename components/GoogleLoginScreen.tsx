import React, { useState, useEffect, useRef } from 'react';
import { UserSession } from '../types';
import {
  ShieldCheck,
  Lock,
  AlertCircle,
  Check,
  Video,
  Users,
  Sparkles,
  BookOpenCheck,
  ArrowLeft,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { signInWithGoogle } from '../services/firebaseAuth';
import firebaseConfig from '../../firebase-applet-config.json';

interface GoogleLoginScreenProps {
  onLoginSuccess: (user: UserSession) => void;
  errorMessage?: string;
  inviteCircleName?: string;
}

const APP_NAME = 'حلقة تسميع';
const CLIENT_ID =
  firebaseConfig.oAuthClientId ||
  '206677198318-etr4rj9fhb4nb2orjcc8u2rgabu947fe.apps.googleusercontent.com';

const FEATURES = [
  {
    icon: Video,
    title: 'مكالمات مرئية مباشرة',
    text: 'اجلس مع إخوانك في حلقة واحدة من أي مكان في العالم.'
  },
  {
    icon: Sparkles,
    title: 'مطابقة ذكية للتلاوة',
    text: 'يتابع التطبيق قراءتك آيةً بآية ويُنبّه إلى الأخطاء.'
  },
  {
    icon: Users,
    title: 'غرف ثنائية للتسميع',
    text: 'قسّم الحلقة إلى أزواج ليسمّع كل اثنين لبعضهما.'
  }
];

const GoogleMark: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" className="shrink-0" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const BrandMark: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <div
    className="rounded-2xl bg-gradient-to-br from-[#1B2B5E] to-[#0E1935] border border-[#3A4C8A]/70 flex items-center justify-center text-[#8CA2FF] shadow-[0_8px_30px_-8px_rgba(140,162,255,0.45)]"
    style={{ width: size, height: size }}
  >
    <svg viewBox="0 0 100 100" width={size * 0.58} height={size * 0.58} fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M14.6 14.6H85.4V85.4H14.6Z M50 0L100 50L50 100L0 50Z" />
    </svg>
  </div>
);

const STEP_LABELS = ['تسجيل الدخول', 'اختيار الاسم', 'الدخول'];

export const GoogleLoginScreen: React.FC<GoogleLoginScreenProps> = ({
  onLoginSuccess,
  errorMessage,
  inviteCircleName
}) => {
  const [step, setStep] = useState<'auth' | 'username' | 'final'>('auth');
  const [isProcessing, setIsProcessing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  const [pendingGoogleUser, setPendingGoogleUser] = useState<{
    email: string;
    name: string;
    picture?: string;
    uid?: string;
    token?: string;
  } | null>(null);

  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isValidatingUsername, setIsValidatingUsername] = useState(false);

  const gsiButtonRef = useRef<HTMLDivElement>(null);

  // Google Identity Services: used only as a fallback button when the popup flow fails
  useEffect(() => {
    if (typeof window === 'undefined' || step !== 'auth' || !showFallback) return;

    const handleCredentialResponse = (response: any) => {
      try {
        if (!response || !response.credential) return;

        const base64Url = response.credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          window
            .atob(base64)
            .split('')
            .map((c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const payload = JSON.parse(jsonPayload);

        onGoogleAuthSelected({
          email: payload.email,
          name: payload.name,
          picture: payload.picture,
          uid: payload.sub,
          token: response.credential
        });
      } catch (err) {
        console.error('Error decoding Google credential:', err);
        setAuthError('تعذر معالجة رمز الدخول من Google.');
      }
    };

    const renderGsi = () => {
      const google = (window as any).google;
      if (google?.accounts?.id) {
        try {
          google.accounts.id.initialize({
            client_id: CLIENT_ID,
            callback: handleCredentialResponse,
            auto_select: false
          });
          if (gsiButtonRef.current) {
            gsiButtonRef.current.innerHTML = '';
            google.accounts.id.renderButton(gsiButtonRef.current, {
              type: 'standard',
              theme: 'filled_black',
              size: 'large',
              text: 'continue_with',
              shape: 'pill',
              locale: 'ar',
              width: 320
            });
          }
        } catch (e) {
          console.warn('GSI render notice:', e);
        }
        return true;
      }
      return false;
    };

    if (!renderGsi()) {
      const timer = setInterval(() => {
        if (renderGsi()) clearInterval(timer);
      }, 300);
      return () => clearInterval(timer);
    }
  }, [step, showFallback]);

  // Clean URL hash if any
  useEffect(() => {
    try {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch {}
  }, []);

  const onGoogleAuthSelected = (profile: {
    email: string;
    name?: string;
    picture?: string;
    uid?: string;
    token?: string;
  }) => {
    const cleanEmail = profile.email.trim().toLowerCase();
    const rawName = (profile.name || cleanEmail.split('@')[0]).trim();
    const words = rawName.split(/\s+/).filter(w => w.length > 0);
    const suggestedName = words.slice(0, 2).join(' ') || cleanEmail.split('@')[0];

    setPendingGoogleUser({
      email: cleanEmail,
      name: rawName,
      picture: profile.picture,
      uid: profile.uid || 'g_' + cleanEmail.replace(/[^a-zA-Z0-9_]/g, '_'),
      token: profile.token || 'tok_' + Date.now()
    });

    setUsernameInput(suggestedName);
    setUsernameError(null);
    setAuthError(null);
    setStep('username');
  };

  const handleFirebaseGooglePopup = async () => {
    setIsProcessing(true);
    setAuthError(null);

    try {
      const session = await signInWithGoogle();
      if (session && session.email) {
        onGoogleAuthSelected({
          email: session.email,
          name: session.name,
          picture: session.picture,
          uid: session.uid,
          token: session.token
        });
      }
    } catch (err: any) {
      console.warn('Firebase Google Auth error:', err);
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('تم إغلاق نافذة تسجيل الدخول قبل اكتمالها.');
      } else if (code === 'auth/cancelled-popup-request') {
        setAuthError('تم إلغاء الطلب، يرجى المحاولة مرة أخرى.');
      } else {
        setAuthError(err?.message || 'حدث خطأ أثناء الاتصال بحساب Google.');
        setShowFallback(true);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Username: 1–2 words, unique within the group
  const handleValidateAndSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const enteredName = usernameInput.trim();
    setUsernameError(null);

    const words = enteredName.split(/\s+/).filter(word => word.length > 0);

    if (words.length === 0) {
      setUsernameError('يرجى كتابة الاسم أولاً.');
      return;
    }
    if (words.length > 2) {
      setUsernameError('عذراً، يجب ألا يزيد الاسم عن اسمين فقط (كلمتين).');
      return;
    }

    setIsValidatingUsername(true);

    try {
      const res = await fetch('/api/user/check-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingGoogleUser?.email,
          username: enteredName
        })
      });
      const checkData = await res.json();
      if (!checkData.valid) {
        setUsernameError(checkData.error || 'هذا الاسم مستخدم بالفعل في المجموعة، يرجى اختيار اسم آخر.');
        setIsValidatingUsername(false);
        return;
      }
    } catch {
      // Proceed on network failure
    }

    setStep('final');

    setTimeout(async () => {
      if (pendingGoogleUser) {
        await handleVerifiedGoogleUser({
          ...pendingGoogleUser,
          name: enteredName
        });
      }
    }, 1100);
  };

  const handleVerifiedGoogleUser = async (profile: {
    email: string;
    name: string;
    uid?: string;
    picture?: string;
    token?: string;
  }) => {
    setIsProcessing(true);
    setAuthError(null);

    const cleanEmail = profile.email.trim().toLowerCase();
    const cleanName = profile.name.trim();
    const cleanUid = profile.uid || 'g_' + cleanEmail.replace(/[^a-zA-Z0-9_]/g, '_');
    const cleanPic = profile.picture;

    try {
      let verifiedUser: UserSession = {
        id: 'p_' + (cleanUid ? cleanUid.slice(0, 10) : 'user'),
        name: cleanName,
        email: cleanEmail,
        token: profile.token || 'tok_' + Date.now(),
        uid: cleanUid,
        picture: cleanPic
      };

      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken: profile.token,
            email: cleanEmail,
            name: cleanName,
            uid: cleanUid,
            picture: cleanPic,
            token: profile.token
          })
        });

        if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
          const data = await res.json();
          if (data && data.success && data.user) {
            verifiedUser = {
              id: 'p_' + (data.user.uid ? data.user.uid.slice(0, 10) : 'user'),
              name: data.user.name || cleanName,
              email: data.user.email || cleanEmail,
              token: data.sessionToken || profile.token || 'tok_' + Date.now(),
              uid: data.user.uid || cleanUid,
              picture: data.user.picture || cleanPic
            };
          }
        }
      } catch (serverErr) {
        console.warn('Backend verification notice:', serverErr);
      }

      try {
        sessionStorage.setItem('t_session_token', verifiedUser.token);
        sessionStorage.setItem('t_session_name', verifiedUser.name);
        sessionStorage.setItem('t_session_uid', verifiedUser.uid);
        sessionStorage.setItem('t_session_email', verifiedUser.email);
        if (verifiedUser.picture) {
          sessionStorage.setItem('t_session_pic', verifiedUser.picture);
        }
      } catch {}

      onLoginSuccess(verifiedUser);
    } catch (err: any) {
      console.error('Server Google verification error:', err);
      setAuthError(err?.message || 'حدث خطأ أثناء التواصل مع Google.');
      setIsProcessing(false);
      setStep('auth');
    }
  };

  const stepIndex = step === 'auth' ? 0 : step === 'username' ? 1 : 2;

  return (
    <div
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-[#070D1D] text-[#E7EBF8] font-['IBM_Plex_Sans_Arabic',sans-serif]"
    >
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-[620px] h-[620px] rounded-full bg-[#3B5BDB]/20 blur-[140px]" />
        <div className="absolute -bottom-48 -left-40 w-[560px] h-[560px] rounded-full bg-[#1FA36B]/15 blur-[140px]" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.05]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="halaqa-pattern" width="72" height="72" patternUnits="userSpaceOnUse">
              <path
                d="M36 6 L46 26 L66 36 L46 46 L36 66 L26 46 L6 36 L26 26 Z"
                fill="none"
                stroke="#8CA2FF"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#halaqa-pattern)" />
        </svg>
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 sm:px-8">
        {/* Top bar */}
        <header className="flex items-center justify-between py-5 sm:py-7">
          <div className="flex items-center gap-3">
            <BrandMark size={40} />
            <span className="text-lg font-extrabold tracking-tight text-white">{APP_NAME}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#9AA7C9] bg-[#121A33]/80 border border-[#27325A] rounded-full px-3 py-1.5">
            <Lock className="w-3 h-3 text-[#6FD39A]" />
            <span>اتصال آمن</span>
          </div>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center gap-10 pb-10 lg:flex-row lg:justify-between lg:gap-16">
          {/* Hero (desktop) */}
          <section className="hidden max-w-xl flex-1 lg:block">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#23583C] bg-[#122A22]/80 px-3.5 py-1.5 text-xs font-semibold text-[#6FD39A]">
              <BookOpenCheck className="w-3.5 h-3.5" />
              لمراجعة وتثبيت القرآن الكريم
            </span>
            <h1 className="mt-5 text-5xl font-extrabold leading-[1.25] tracking-tight text-white">
              ثبّت حفظك
              <br />
              <span className="bg-gradient-to-l from-[#8CA2FF] to-[#6FD39A] bg-clip-text text-transparent">
                في حلقة تجمعك بإخوانك
              </span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-8 text-[#9AA7C9]">
              {APP_NAME} منصة عالمية لمراجعة القرآن الكريم وتسميعه عبر مكالمات مرئية، مع مطابقة ذكية للتلاوة وغرف ثنائية للتسميع.
            </p>

            <ul className="mt-9 space-y-3.5">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li
                  key={title}
                  className="flex items-start gap-4 rounded-2xl border border-[#27325A]/70 bg-[#0E1630]/70 p-4 backdrop-blur-sm"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#2D3F7A] bg-[#16224A] text-[#8CA2FF]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{title}</p>
                    <p className="mt-0.5 text-xs leading-6 text-[#9AA7C9]">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Sign-in card */}
          <section className="w-full max-w-[440px] shrink-0">
            <div className="rounded-3xl border border-[#2A3763] bg-[#101830]/90 p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-8">
              {/* Progress */}
              <div className="mb-6 flex items-center gap-2" aria-label="مراحل التسجيل">
                {STEP_LABELS.map((label, i) => (
                  <div key={label} className="flex-1">
                    <div
                      className={`h-1 rounded-full transition-colors duration-300 ${
                        i <= stepIndex ? 'bg-[#8CA2FF]' : 'bg-[#27325A]'
                      }`}
                    />
                    <span
                      className={`mt-1.5 block text-[10px] font-semibold ${
                        i === stepIndex ? 'text-[#C5D0FF]' : 'text-[#5E6D96]'
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {inviteCircleName && (
                <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-[#C58A1B]/40 bg-[#C58A1B]/15 p-3 text-center text-xs font-semibold text-[#F2C14E]">
                  <span>🌟</span>
                  <span>
                    دعوة للانضمام إلى: <b>{inviteCircleName}</b>
                  </span>
                </div>
              )}

              {(errorMessage || authError) && (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2 rounded-xl border border-[#B3261E]/30 bg-[#3C1D22] p-3 text-right text-xs text-[#FF9A91]"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMessage || authError}</span>
                </div>
              )}

              {/* ============ Step 1: Sign in ============ */}
              {step === 'auth' && (
                <div className="animate-in fade-in duration-200">
                  <h2 className="text-2xl font-extrabold tracking-tight text-white">
                    أهلاً بك في {APP_NAME}
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-[#9AA7C9]">
                    سجّل دخولك للانضمام إلى حلقتك ومتابعة مراجعتك مع إخوانك.
                  </p>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleFirebaseGooglePopup}
                    className="group mt-6 flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-[#DADCE0] bg-white px-5 py-3 text-[15px] font-semibold text-[#1F1F1F] shadow-md transition-all hover:bg-[#F8F9FA] hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-[#4285F4]/40 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-5 w-5 animate-spin text-[#4285F4]" />
                    ) : (
                      <GoogleMark />
                    )}
                    <span>{isProcessing ? 'جارٍ فتح حساب Google...' : 'المتابعة باستخدام Google'}</span>
                  </button>

                  {showFallback && (
                    <div className="mt-5 animate-in fade-in duration-200">
                      <div className="mb-3 flex items-center gap-3 text-[11px] text-[#5E6D96]">
                        <span className="h-px flex-1 bg-[#27325A]" />
                        <span>طريقة بديلة</span>
                        <span className="h-px flex-1 bg-[#27325A]" />
                      </div>
                      <div className="flex min-h-[44px] justify-center" ref={gsiButtonRef} />
                    </div>
                  )}

                  <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#27325A] bg-[#0B1226] p-3.5">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#6FD39A]" />
                    <p className="text-[11px] leading-6 text-[#9AA7C9]">
                      لا نصل إلى كلمة مرور حسابك أبداً. نستخدم اسمك وبريدك فقط لإنشاء حسابك وحفظ حلقتك ومحادثاتك بشكل دائم.
                    </p>
                  </div>

                  <div className="mt-4 flex justify-center">
                    <PWAInstallButton className="w-full justify-center py-2.5" />
                  </div>

                  <p className="mt-5 text-center text-[11px] leading-6 text-[#5E6D96]">
                    بمتابعتك فإنك توافق على شروط الاستخدام وسياسة الخصوصية الخاصة بـ{APP_NAME}.
                  </p>
                </div>
              )}

              {/* ============ Step 2: Username ============ */}
              {step === 'username' && (
                <div className="animate-in fade-in d
