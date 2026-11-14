import React, { useState, useRef, useEffect } from 'react';
import { UserSession, CircleRoom } from '../types';
import { toArabicNumerals } from '../utils/tasmeeEngine';
import { 
  Video, 
  X, 
  Users, 
  ChevronDown, 
  Radio, 
  Send,
  Phone,
  PhoneOff,
  Link2,
  Copy,
  Check,
  LogOut,
  FolderPlus,
  Bell,
  VolumeX
} from 'lucide-react';
import { ringPlayer } from '../utils/callRingAudio';

interface GroupMessage {
  id: string;
  senderName: string;
  senderEmail: string;
  senderInitial: string;
  subHeader: string;
  text: string;
  time: string;
  isExcuse?: boolean;
  isMe?: boolean;
}

interface MemberStatus {
  name: string;
  email: string;
  badge?: string;
  lastDateText: string;
}

interface GroupChatScreenProps {
  user: UserSession;
  circle: CircleRoom;
  onJoinCall: () => void;
  onBackToCircles: () => void;
  onLogout?: () => void;
}

// 8-Pointed Islamic Star Octagram Badge
export const OctagramBadge: React.FC<{ letter: string; size?: number; className?: string }> = ({
  letter,
  size = 36,
  className = ''
}) => {
  return (
    <div
      className={`relative flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full text-[#1C2C55] fill-current drop-shadow-xs">
        <path fillRule="evenodd" d="M14.6 14.6H85.4V85.4H14.6Z M50 0L100 50L50 100L0 50Z" />
      </svg>
      <span className="absolute text-[#8CA2FF] font-bold text-xs select-none uppercase">
        {letter}
      </span>
    </div>
  );
};

export const GroupChatScreen: React.FC<GroupChatScreenProps> = ({
  user,
  circle,
  onJoinCall,
  onBackToCircles,
  onLogout,
}) => {
  // Members popup is integrated into clicking the group name in header
  const [showMembersPopup, setShowMembersPopup] = useState(false);
  const [activeCallPeersCount, setActiveCallPeersCount] = useState<number>(0);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Dynamic real members state (synced with server)
  const [currentMembers, setCurrentMembers] = useState<string[]>(circle.members || [user.email]);

  // Creator privilege check: Only circle creator can add new members
  const isCreator = (circle.creatorEmail || '').toLowerCase() === user.email.toLowerCase() ||
                    (circle.creatorName || '') === user.name;
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [addMemberStatus, setAddMemberStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const [isAddingMember, setIsAddingMember] = useState(false);

  // Invite URL for this official created circle
  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?join=${circle.id}&circle=${encodeURIComponent(circle.name || '')}`
    : '';

  const handleCopyInvite = () => {
    if (!inviteUrl) return;
    try {
      navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2200);
    } catch {}
  };

  const handleAddMember = async () => {
    if (!isCreator) return;
    setAddMemberStatus(null);
    const target = newMemberEmail.trim().toLowerCase();
    if (!target) return;

    setIsAddingMember(true);
    try {
      const res = await fetch('/api/circles/add-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          circleId: circle.id,
          requesterEmail: user.email,
          newMemberEmail: target
        })
      });
      const data = await res.json();
      if (data.success) {
        setAddMemberStatus({ text: data.message, isError: false });
        setNewMemberEmail('');
        if (!currentMembers.includes(target)) {
          setCurrentMembers(prev => [...prev, target]);
        }
      } else {
        setAddMemberStatus({ text: data.message || 'تعذر إضافة العضو', isError: true });
      }
    } catch {
      setAddMemberStatus({ text: 'خطأ في الاتصال بالخادم', isError: true });
    } finally {
      setIsAddingMember(false);
    }
  };

  // Synchronize circle members from server periodically
  useEffect(() => {
    let active = true;
    const fetchCircleData = async () => {
      try {
        const res = await fetch(`/api/circles/${circle.id}`);
        if (res.ok) {
          const data = await res.json();
          if (active && data.circle && Array.isArray(data.circle.members)) {
            setCurrentMembers(data.circle.members);
          }
        }
      } catch {}
    };
    fetchCircleData();
    const interval = setInterval(fetchCircleData, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [circle.id]);

  // Registered members based on real email names
  const membersData: MemberStatus[] = currentMembers.map(emailOrName => {
    const isEmail = emailOrName.includes('@');
    const email = isEmail ? emailOrName.toLowerCase() : `${emailOrName.toLowerCase()}@gmail.com`;
    const name = email.split('@')[0];
    return {
      name,
      email,
      lastDateText: email === user.email.toLowerCase() ? 'أنت' : 'عضو رسمي'
    };
  });

  // Pure server messages (Starts empty, no canned mock messages)
  const [messages, setMessages] = useState<GroupMessage[]>([]);

  const [inputText, setInputText] = useState('');
  const [isExcuseActive, setIsExcuseActive] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  interface ActiveCallInfo {
    callerName: string;
    callerEmail: string;
    startedAt: number;
    status: 'ringing' | 'connected';
    participants: string[];
  }
  const [activeCallInfo, setActiveCallInfo] = useState<ActiveCallInfo | null>(null);
  const [dismissedCallStartedAt, setDismissedCallStartedAt] = useState<number | null>(null);
  const [hasNotifPermission, setHasNotifPermission] = useState<boolean>(() => {
    return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
  });

  // Request native permissions for notifications, mic, and camera
  const handleRequestPermissions = async () => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const perm = await Notification.requestPermission();
        setHasNotifPermission(perm === 'granted');
      }
    } catch {}

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach(t => t.stop());
      }
    } catch {}
  };

  // Check live call server for active call status in this circle
  useEffect(() => {
    let active = true;
    const checkCallStatus = async () => {
      try {
        const res = await fetch(`/api/live-call/peers/${circle.id || 'default'}`);
        if (res.ok) {
          const data = await res.json();
          if (active && data.success && typeof data.count === 'number') {
            setActiveCallPeersCount(data.count);
          }
        }

        // Check if there is an active call in this circle
        const callRes = await fetch(`/api/live-call/call-status/${circle.id || 'default'}`);
        if (callRes.ok) {
          const callData = await callRes.json();
          if (!active) return;
          if (callData.call) {
            setActiveCallInfo(callData.call);

            // Outside app background notification (when tab is in background)
            if (document.hidden && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              if (callData.call.callerEmail.toLowerCase() !== user.email.toLowerCase()) {
                const notif = new Notification('مكالمة قرآن واردة في الحلقة 📞', {
                  body: `${callData.call.callerName} بدأ حلقة مراجعة وتسميع الآن، انقر للرد والانضمام`,
                  icon: '/favicon.ico',
                  tag: `tasmee_call_${circle.id}`
                });
                notif.onclick = () => {
                  window.focus();
                  notif.close();
                };
              }
            }
          } else {
            setActiveCallInfo(null);
          }
        }
      } catch {}
    };

    checkCallStatus();
    const interval = setInterval(checkCallStatus, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [circle.id, user.email]);

  // Caller identification & participant metrics
  const isCaller = activeCallInfo?.callerEmail?.toLowerCase() === user.email.toLowerCase();
  const isDismissed = dismissedCallStartedAt !== null && activeCallInfo !== null && dismissedCallStartedAt === activeCallInfo.startedAt;
  const participantsCount = Math.max(activeCallInfo?.participants?.length || 0, activeCallPeersCount);

  // Call is ongoing as long as activeCallInfo exists or peers count > 0
  const isCallOngoing = activeCallInfo !== null || activeCallPeersCount > 0;

  // Ringing Rule:
  // Starts ringing when call is initiated (participants < 2).
  // STOPS immediately when the first member answers/enters (participants >= 2).
  // Stays silent if user clicked "رفض".
  const shouldPlayRing = Boolean(
    activeCallInfo &&
    !isCaller &&
    !isDismissed &&
    participantsCount < 2 &&
    (activeCallInfo.status === 'ringing' || participantsCount === 1)
  );

  useEffect(() => {
    if (shouldPlayRing) {
      const stopRing = ringPlayer.startIncoming();
      return () => {
        stopRing();
      };
    } else {
      ringPlayer.stop();
    }
  }, [shouldPlayRing]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      ringPlayer.stop();
    };
  }, []);

  // Answer call
  const handleAcceptIncomingCall = async () => {
    ringPlayer.stop();
    try {
      await fetch('/api/calls/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          circleId: circle.id,
          roomId: circle.id,
          userEmail: user.email,
          userId: user.email,
          action: 'ACCEPT_EXPLICIT'
        })
      });
    } catch {}
    onJoinCall();
  };

  // Decline call: stops ringing & hides floating banner, while ongoing card in chat stays available
  const handleDeclineIncomingCall = () => {
    ringPlayer.stop();
    if (activeCallInfo) {
      setDismissedCallStartedAt(activeCallInfo.startedAt);
    }
  };

  // Show floating top banner if call is active, caller is not me, and user hasn't clicked "رفض"
  const showFloatingBanner = Boolean(
    activeCallInfo &&
    !isCaller &&
    !isDismissed &&
    isCallOngoing
  );

  // Load and poll real messages from server every 2 seconds
  useEffect(() => {
    let mounted = true;
    const loadStoredMessages = async () => {
      try {
        const res = await fetch(`/api/messages/${circle.id}`);
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.success && Array.isArray(data.messages)) {
            const mapped = data.messages.map((m: GroupMessage) => ({
              ...m,
              isMe: m.senderEmail?.toLowerCase() === user.email.toLowerCase() || m.senderName === user.name
            }));
            setMessages(mapped);
          }
        }
      } catch {}
    };

    loadStoredMessages();
    const interval = setInterval(loadStoredMessages, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [circle.id, user.email, user.name]);

  // Strict 3-message limit INCLUDING excuses as requested
  const myMessagesCount = messages.filter(m => m.isMe || m.senderEmail === user.email).length;
  const remainingToday = Math.max(0, 3 - myMessagesCount);
  const isLimitReached = remainingToday === 0;

  const membersList = membersData.map(m => m.name).join('، ');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send real message (Strictly saved to server and synced)
  const handleSendMessage = async () => {
    if (isLimitReached) return;

    const trimmed = inputText.trim();
    if (!trimmed) return;

    const now = new Date();
    const timeFormatted = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    const newMsg: GroupMessage = {
      id: 'msg_' + Date.now(),
      senderName: user.name,
      senderEmail: user.email,
      senderInitial: user.name.charAt(0) || 'u',
      subHeader: 'حلقة القرآن',
      text: trimmed,
      time: timeFormatted,
      isExcuse: isExcuseActive,
      isMe: true
    };

    setMessages(prev => [...prev, newMsg]);
    setInputText('');
    setIsExcuseActive(false);

    try {
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: circle.id,
          circleId: circle.id,
          senderEmail: user.email,
          senderId: user.email,
          senderName: user.name,
          text: trimmed,
          isExcuse: isExcuseActive
        })
      });
    } catch {}
  };

  // Direct Entry into Live Video Call ("يدخل مباشرة ينظر بالداخل من يدخل المكالمة ويرد عليها")
  const handleDirectJoinCall = async () => {
    ringPlayer.stop();
    try {
      await fetch('/api/live-call/ring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          circleId: circle.id,
          callerEmail: user.email,
          callerName: user.name
        })
      });
    } catch {}
    onJoinCall();
  };

  return (
    <div className="min-h-screen bg-[#070D1D] text-[#E7EBF8] flex flex-col font-['IBM_Plex_Sans_Arabic',sans-serif] relative overflow-hidden select-none">
      
      {/* Background Subtle Islamic Geometric Pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="islamic-geo-pattern" width="90" height="90" patternUnits="userSpaceOnUse">
              <path
                d="M26 26H64V64H26Z M45 7L83 45L45 83L7 45Z"
                fill="none"
                stroke="#8CA2FF"
                strokeWidth="1"
              />
              <circle cx="45" cy="45" r="5" fill="none" stroke="#8CA2FF" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#islamic-geo-pattern)" />
        </svg>
      </div>

      {/* Top Header Bar: Compact, Modern, Sleek */}
      <header className="bg-[#0B152A] border-b border-[#162544] px-3.5 py-2.5 z-20 flex items-center justify-between shadow-md">
        
        {/* Left Side: "إنضم للمجموعة" */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDirectJoinCall}
            className="flex items-center gap-1.5 bg-[#1C2C55] hover:bg-[#25396D] text-[#8CA2FF] px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border border-[#8CA2FF]/30 active:scale-95 transition-all shadow-xs"
            title="الدخول مباشرة إلى المجموعة والمكالمة"
          >
            <Video className="w-3.5 h-3.5 text-[#8CA2FF]" />
            <span>إنضم للمجموعة</span>
          </button>

        </div>

        {/* Right Side: Group Title and Members Trigger */}
        <div
          onClick={() => setShowMembersPopup(!showMembersPopup)}
          className="flex items-center gap-2.5 text-right cursor-pointer hover:opacity-90 active:scale-98 transition-all group"
          title="اضغط لعرض أعضاء المجموعة"
        >
          <div>
            <div className="flex items-center gap-1 justify-end">
              <ChevronDown className="w-3 h-3 text-[#7A8EBA] group-hover:text-[#8CA2FF] transition-colors" />
              <h1 className="text-xs sm:text-sm font-semibold text-white tracking-wide">
                {circle.name || 'حلقة القرآن الكريم'}
              </h1>
            </div>
            <p className="text-[10px] text-[#7A8EBA] max-w-xs truncate" dir="rtl">
              {membersList}
            </p>
          </div>

          <OctagramBadge letter="ح" size={36} className="text-[#1E3060]" />
        </div>
      </header>

      {/* Permission Request Bar (Subtle & Polished) */}
      {typeof window !== 'undefined' && 'Notification' in window && !hasNotifPermission && Notification.permission === 'default' && (
        <div className="bg-[#0E1A33] border-b border-[#1C3260] px-4 py-2 flex items-center justify-between text-xs text-[#8CA2FF] z-20">
          <div className="flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5 text-[#F2C14E]" />
            <span>تفعيل تنبيهات الرنين والكاميرا والمايك لمكالمات الحلقة</span>
          </div>
          <button
            type="button"
            onClick={handleRequestPermissions}
            className="bg-[#1A3160] hover:bg-[#254587] text-white px-3 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all shadow-xs"
          >
            تفعيل الصلاحيات ✓
          </button>
        </div>
      )}

      {/* Members Popup Modal */}
      {showMembersPopup && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-2xs flex items-start justify-center p-4 pt-16 animate-in fade-in duration-150"
          onClick={() => setShowMembersPopup(false)}
        >
          <div
            className="bg-[#0D1832] border border-[#1E3260] rounded-2xl max-w-md w-full p-4 shadow-2xl space-y-3 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#18294E] pb-2.5">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#8CA2FF]" />
                <span className="font-bold text-sm text-white">أعضاء الحلقة الرسميون</span>
                <span className="bg-[#1A284A] text-[#8CA2FF] text-[11px] px-2 py-0.5 rounded-full font-bold">
                  {toArabicNumerals(membersData.length)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowMembersPopup(false)}
                className="text-[#7A8EBA] hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Official Invite Link Card */}
            <div className="bg-[#0B1630] border border-[#1C3263] rounded-xl p-3 flex items-center justify-between gap-2.5 text-right">
              <button
                type="button"
                onClick={handleCopyInvite}
                className="bg-[#172A52] hover:bg-[#203B75] text-[#8CA2FF] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 active:scale-95"
              >
                {copiedInvite ? <Check className="w-3.5 h-3.5 text-[#52D17C]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedInvite ? 'تم النسخ' : 'نسخ رابط الدعوة'}</span>
              </button>
              <div className="space-y-0.5 truncate">
                <span className="text-white text-xs font-semibold block">رابط الدعوة المباشر</span>
                <span className="text-[#7A8EBA] text-[10px] block truncate">انضمام مباشر لحسابات الحفاظ الحقيقية</span>
              </div>
            </div>

            {/* Creator-Only Add Member Section */}
            {isCreator ? (
              <div className="bg-[#122144] border border-[#213C78] rounded-xl p-3 space-y-2 text-right">
                <div className="flex items-center justify-between text-xs font-semibold text-white">
                  <span>إضافة عضو بالبريد (خاص بالمنشئ)</span>
                  <span className="text-[10px] text-[#6FD39A] bg-[#163827] px-2 py-0.5 rounded-full border border-[#255C41]">أنت منشئ الحلقة</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
                    placeholder="أدخل بريد الحافظ (مثال: belal@gmail.com)..."
                    className="flex-1 bg-[#091224] border border-[#1E3A70] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#8CA2FF]"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={handleAddMember}
                    disabled={isAddingMember}
                    className="bg-[#8CA2FF] hover:bg-[#A3B5FF] text-[#0A1230] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isAddingMember ? '...' : 'أضف'}
                  </button>
                </div>
                {addMemberStatus && (
                  <p className={`text-[11px] ${addMemberStatus.isError ? 'text-[#FF9A91]' : 'text-[#6FD39A]'}`}>
                    {addMemberStatus.text}
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-[#101C38] border border-[#192A50] rounded-xl p-2.5 text-right text-xs text-[#7A8EBA] flex items-center justify-between">
                <span>منشئ الحلقة:</span>
                <span className="text-white font-semibold">{circle.creatorName || 'المنشئ'}</span>
              </div>
            )}

            <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pt-1">
              {membersData.map((m, idx) => (
                <div
                  key={idx}
                  className="bg-[#101C38] border border-[#192A50] rounded-xl px-3.5 py-2 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{m.name}</span>
                    <span className="text-[#7A8EBA] text-[10px] font-mono">({m.email})</span>
                  </div>
                  <span className="text-[#647C9E] text-[11px]">
                    {m.lastDateText}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Messages Scroll Area */}
      <main className="flex-1 overflow-y-auto px-4 py-4 z-10 flex flex-col gap-4 max-w-2xl w-full mx-auto">
        
        {/* Date and Group Creation Center Divider */}
        <div className="flex flex-col items-center gap-1.5 my-1">
          <span className="bg-[#101C38] text-[#7A8EBA] text-[11px] px-3 py-1 rounded-full border border-[#1C2E58]">
            حلقة التسميع المباشرة
          </span>
          <span className="bg-[#101C38]/90 text-[#8CA2FF] text-[11px] px-4 py-1 rounded-full border border-[#1C2E58]/80 shadow-xs">
            {circle.creatorName || user.name} أنشأ «{circle.name}»
          </span>
        </div>

        {/* Empty State Banner if no messages yet */}
        {messages.length === 0 && (
          <div className="py-12 text-center text-xs text-[#6B80A8] space-y-3 bg-[#0B152A]/50 rounded-2xl border border-[#162544] p-6 max-w-md mx-auto">
            <p className="text-sm font-semibold text-white">لا توجد رسائل سابقة في هذه الحلقة</p>
            <p className="text-[11px] text-[#7A8EBA] leading-relaxed">
              جميع الرسائل المتبادلة تظهر لجميع أعضاء الحلقة والراسل مباشرة فور إرسالها.
            </p>
            <button
              type="button"
              onClick={handleCopyInvite}
              className="inline-flex items-center gap-1.5 bg-[#162952] hover:bg-[#203B75] text-[#8CA2FF] px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all"
            >
              {copiedInvite ? <Check className="w-3.5 h-3.5 text-[#52D17C]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>نسخ رابط دعوة الحفاظ</span>
            </button>
          </div>
        )}

        {/* Real Messages List */}
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2.5 max-w-md self-start text-right">
            <OctagramBadge letter={m.senderInitial || m.senderName.charAt(0)} size={36} />

            <div className="bg-[#121E3B] border border-[#1C2E58] rounded-2xl p-3.5 shadow-md flex-1 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-[#8CA2FF]">
                  {m.senderName}
                </span>

                {m.isExcuse && (
                  <span className="bg-[#C58A1B] text-[#111B38] text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                    عذر عن عدم الحضور
                  </span>
                )}
              </div>

              <p className="text-xs sm:text-sm text-[#EDEFF9] leading-relaxed">
                {m.text}
              </p>

              <div className="text-[10px] text-[#556D9C] text-left pt-0.5" dir="ltr">
                {m.time}
              </div>
            </div>
          </div>
        ))}

        {/* Modern Live Call Indicator Card in Chat Stream (After last message) */}
        {isCallOngoing && (
          <div
            onClick={handleDirectJoinCall}
            className="w-full my-3 bg-gradient-to-r from-[#101E3D] via-[#122A4E] to-[#101E3D] border-2 border-[#294B8C] hover:border-[#4D7AD4] rounded-2xl p-4 shadow-xl cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] group text-right relative overflow-hidden"
          >
            {/* Ambient Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#52D17C]/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between gap-3 relative z-10">
              
              {/* Right side: Icon + Live Details */}
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 rounded-2xl bg-[#162D5A] border border-[#355AA6] flex items-center justify-center text-[#8CA2FF] shrink-0 shadow-md">
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#52D17C] rounded-full border-2 border-[#101E3D] animate-ping" />
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#52D17C] rounded-full border-2 border-[#101E3D]" />
                  <Video className="w-5 h-5 text-[#8CA2FF] group-hover:scale-110 transition-transform" />
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white group-hover:text-[#A3B8FF] transition-colors">
                      حلقة مراجعة وتسميع قائمة الآن
                    </span>
                    <span className="bg-[#103023] text-[#52D17C] border border-[#23684B] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#52D17C] animate-pulse" />
                      مباشر
                    </span>
                  </div>
                  <p className="text-[11px] text-[#A5B7DB]">
                    {activeCallInfo?.callerName ? `بدأها الحافظ ${activeCallInfo.callerName} • ` : ''}
                    {participantsCount > 1 
                      ? `${toArabicNumerals(participantsCount)} متواجدين في الساحة • انقر للدخول والتسميع معهم`
                      : 'الحلقة جارية وبانتظار انضمام بقية الحفاظ • انقر للدخول الآن'}
                  </p>
                </div>
              </div>

              {/* Left side: Join Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDirectJoinCall();
                }}
                className="bg-[#22C55E] hover:bg-[#16A34A] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg active:scale-95 transition-all shrink-0 ring-2 ring-[#22C55E]/20"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>انضم للمكالمة 📞</span>
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Bottom Control & Input Bar */}
      <footer className="bg-[#0A1428] border-t border-[#162544] px-4 py-3 z-20 space-y-2.5">
        <div className="max-w-2xl mx-auto space-y-2">
          
          {/* Action Pills Row */}
          <div className="flex items-center justify-between text-xs px-1">
            <button
              type="button"
              disabled={isLimitReached}
              onClick={() => setIsExcuseActive(!isExcuseActive)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all select-none ${
                isLimitReached
                  ? 'bg-[#10182E] text-[#556D9C] border-[#1C2E58]/50 opacity-50 cursor-not-allowed'
                  : isExcuseActive
                  ? 'bg-[#C58A1B] text-[#111B38] border-[#C58A1B] cursor-pointer'
                  : 'bg-[#121E3B] hover:bg-[#1A2C55] text-white border-[#1C2E58] cursor-pointer'
              }`}
            >
              عذر عن الحضور {isExcuseActive ? '✓' : ''}
            </button>

            <div
              className={`text-xs px-3.5 py-1 rounded-full font-medium border ${
                isLimitReached
                  ? 'bg-[#2A151C] text-[#FF9A91] border-[#FF9A91]/30'
                  : 'bg-[#121E3B] border-[#1C2E58] text-[#8CA2FF]'
              }`}
            >
              {isLimitReached
                ? 'استهلكت ٣ من ٣ رسائل اليوم (تشمل الأعذار)'
                : `تبقّى ${toArabicNumerals(remainingToday)} من ٣ رسائل اليوم`}
            </div>
          </div>

          {/* Input & Send Button Row */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isLimitReached || !inputText.trim()}
              onClick={handleSendMessage}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-sm transition-all shrink-0 ${
                isLimitReached || !inputText.trim()
                  ? 'bg-[#192644] text-[#4A5D84] cursor-not-allowed'
                  : 'bg-[#8CA2FF] hover:bg-[#A3B5FF] text-[#0A1230] cursor-pointer active:scale-95'
              }`}
            >
              أرسل
            </button>

            <input
              type="text"
              value={inputText}
              disabled={isLimitReached}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={isLimitReached ? 'وصلت للحد الأقصى اليوم (٣ رسائل، تشمل الأعذار)' : 'مراسلة'}
              className={`flex-1 border text-xs sm:text-sm px-4 py-2.5 rounded-xl text-right focus:outline-none transition-all ${
                isLimitReached
                  ? 'bg-[#0E1528] border-[#162544] text-[#556D9C] cursor-not-allowed placeholder-[#4A5D84]'
                  : 'bg-[#101C38] border-[#1C2E58] text-white placeholder-[#556D9C] focus:border-[#8CA2FF]'
              }`}
            />
          </div>
        </div>
      </footer>

      {/* Floating Top Notification Banner / Rectangle (With Sound until first peer joins, then Silent) */}
      {showFloatingBanner && activeCallInfo && (
        <aside
          aria-label="إشعار مكالمة واردة"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-lg bg-[#0C1630]/95 backdrop-blur-md border-2 border-[#2F529E] rounded-2xl p-3 sm:p-3.5 shadow-2xl animate-in slide-in-from-top-4 duration-200 text-right"
          dir="rtl"
        >
          <div className="flex items-center justify-between gap-2.5">
            {/* Caller Info & Status */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <OctagramBadge letter={activeCallInfo.callerName.charAt(0) || 'ح'} size={40} />
                {shouldPlayRing && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#52D17C] rounded-full border-2 border-[#0C1630] animate-ping" />
                )}
              </div>

              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white truncate">
                    {activeCallInfo.callerName}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    shouldPlayRing 
                      ? 'bg-[#153423] text-[#52D17C] border-[#256846] animate-pulse'
                      : 'bg-[#182645] text-[#8CA2FF] border-[#294278]'
                  }`}>
                    {shouldPlayRing ? 'يرن الآن 🔔' : 'رنين صامت 🔕'}
                  </span>
                </div>
                <p className="text-[11px] text-[#A5B8E2] truncate">
                  {participantsCount >= 2 
                    ? `مكالمة جارية الآن (${toArabicNumerals(participantsCount)} متصلين)`
                    : 'يدعوك للانضمام إلى جلسة التسميع المباشرة'}
                </p>
              </div>
            </div>

            {/* Answer & Decline Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleDeclineIncomingCall}
                className="bg-[#2D1217] hover:bg-[#E02E49] text-[#FF9A91] hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold border border-[#6E1C27] transition-all cursor-pointer shadow-sm active:scale-95"
              >
                رفض ✕
              </button>

              <button
                type="button"
                onClick={handleAcceptIncomingCall}
                className="bg-[#22C55E] hover:bg-[#16A34A] text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md active:scale-95 flex items-center gap-1 ring-2 ring-[#22C55E]/30 animate-pulse"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>رد 📞</span>
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
};
