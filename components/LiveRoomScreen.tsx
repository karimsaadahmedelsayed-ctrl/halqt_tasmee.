import React, { useState, useEffect, useRef } from 'react';
import { UserSession, CircleRoom } from '../types';
import { toArabicNumerals } from '../utils/tasmeeEngine';
import { 
  Video, 
  Mic, 
  MicOff, 
  VideoOff, 
  ChevronLeft, 
  PhoneOff, 
  Link2, 
  Copy, 
  Check, 
  Users, 
  UserPlus, 
  Shuffle, 
  Lock, 
  Sparkles, 
  Volume2, 
  Radio
} from 'lucide-react';
import { OctagramBadge } from './GroupChatScreen';
import { ringPlayer } from '../utils/callRingAudio';

interface LiveRoomScreenProps {
  user: UserSession;
  circle: CircleRoom;
  isCaller?: boolean;
  onBackToGroup: () => void;
  onEnterPairRoom: (pairInfo: { roomNumber: number; partnerName: string; myRole: 'reciter' | 'listener'; partnerEmail?: string }) => void;
}

interface ParticipantTileData {
  id: string;
  name: string;
  email: string;
  letter: string;
  isMe?: boolean;
  hasCam: boolean;
  isMuted: boolean;
  location: 'lobby' | 'pair_room';
  assignedRoom?: string;
}

export const LiveRoomScreen: React.FC<LiveRoomScreenProps> = ({
  user,
  circle,
  isCaller = true,
  onBackToGroup,
  onEnterPairRoom
}) => {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasMediaStream, setHasMediaStream] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [waitingNotice, setWaitingNotice] = useState<string | null>(null);

  // Modals
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showPickPartnerModal, setShowPickPartnerModal] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [pendingAssignment, setPendingAssignment] = useState<{
    roomNumber: number;
    partnerName: string;
    partnerEmail?: string;
    myRole: 'reciter' | 'listener';
  } | null>(null);

  // Real-time server breakout & lobby state
  const [onlinePeers, setOnlinePeers] = useState<Array<{
    id: string;
    email: string;
    name: string;
    location: 'lobby' | 'pair_room';
    pairRoomNumber?: number;
    partnerName?: string;
    isCamOn: boolean;
    isMicOn: boolean;
  }>>([]);
  const [activeBreakoutRooms, setActiveBreakoutRooms] = useState<Array<{
    roomNumber: number;
    user1Name: string;
    user2Name: string;
  }>>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Set local video node
  const setLocalVideoNode = (node: HTMLVideoElement | null) => {
    localVideoRef.current = node;
    if (node && streamRef.current) {
      if (node.srcObject !== streamRef.current) {
        node.srcObject = streamRef.current;
      }
      node.play().catch(() => {});
    }
  };

  // Robust multi-tier media stream requester
  const initMedia = async () => {
    setMediaError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMediaError('المتصفح لا يدعم الوصول المباشر للكاميرا والمايكروفون');
        return;
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true }
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          }
        }
      }

      if (!stream) {
        setMediaError('وضع الاستماع مفعل (الميكروفون أو الكاميرا غير متاحين)');
        setHasMediaStream(false);
        setMicOn(false);
        return;
      }

      streamRef.current = stream;
      setHasMediaStream(true);

      if (localVideoRef.current && stream.getVideoTracks().length > 0) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      // Audio Analyser Setup ONLY if stream contains active audio tracks
      if (stream.getAudioTracks().length > 0) {
        try {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const audioCtx = new AudioCtx();
          if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);

          audioCtxRef.current = audioCtx;
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          let speechReleaseTimer: NodeJS.Timeout | null = null;

          const checkVolume = () => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            if (average > 15) {
              setIsSpeaking(true);
              if (speechReleaseTimer) clearTimeout(speechReleaseTimer);
              speechReleaseTimer = setTimeout(() => {
                setIsSpeaking(false);
              }, 350);
            }
            animFrameRef.current = requestAnimationFrame(checkVolume);
          };
          animFrameRef.current = requestAnimationFrame(checkVolume);
        } catch (err) {
          console.warn('Audio analyser notice:', err);
        }
      }
    } catch (err) {
      console.error('Failed to init media:', err);
      setMediaError('وضع الاستماع مفعل (تعذر تفعيل الكاميرا أو المايكروفون)');
      setHasMediaStream(false);
      setMicOn(false);
    }
  };

  // Safe teardown of all Lobby Audio & Video channels before entering Pair Room
  const teardownLobbyMedia = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    ringPlayer.stop();
  };

  useEffect(() => {
    initMedia();

    return () => {
      teardownLobbyMedia();
    };
  }, []);

  // Update track enabled state
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(t => { t.enabled = micOn; });
    }
  }, [micOn]);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach(t => { t.enabled = camOn; });
    }
  }, [camOn]);

  // Join Main Lobby on server & Poll Breakout status
  useEffect(() => {
    let active = true;

    // Join lobby
    fetch('/api/live-call/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        circleId: circle.id,
        email: user.email,
        name: user.name,
        isCamOn: camOn,
        isMicOn: micOn
      })
    })
    .then(r => r.json())
    .then(data => {
      if (active && data.allPeers) {
        setOnlinePeers(data.allPeers);
      }
    })
    .catch(() => {});

    // Polling Breakout Status loop: updates lobby peers, active rooms, and remote distribution triggers
    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/breakout/status/${encodeURIComponent(circle.id)}/${encodeURIComponent(user.email)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!active || !data.success) return;

        if (data.lobbyPeers || data.pairPeers) {
          const combined = [...(data.lobbyPeers || []), ...(data.pairPeers || [])];
          setOnlinePeers(combined);
        }
        if (data.rooms) {
          setActiveBreakoutRooms(data.rooms);
        }

        // Auto-transition if user was distributed by someone else into a pair room
        if (data.myLocation === 'pair_room' && data.myAssignment && !showSplitModal) {
          teardownLobbyMedia();
          onEnterPairRoom({
            roomNumber: data.myAssignment.roomNumber || 1,
            partnerName: data.myAssignment.partnerName || 'الشريك',
            partnerEmail: data.myAssignment.partnerEmail,
            myRole: data.myAssignment.role || 'listener'
          });
        }
      } catch {}
    };

    pollStatus();
    const interval = setInterval(pollStatus, 2500);

    // Heartbeat ping
    const pingInterval = setInterval(() => {
      fetch('/api/live-call/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circleId: circle.id, email: user.email })
      }).catch(() => {});
    }, 5000);

    return () => {
      active = false;
      clearInterval(interval);
      clearInterval(pingInterval);
      ringPlayer.stop();
      teardownLobbyMedia();
      fetch('/api/live-call/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circleId: circle.id, email: user.email })
      }).catch(() => {});
    };
  }, [circle.id, user.email, user.name]);

  // Outgoing ring sound if alone in lobby
  useEffect(() => {
    if (isCaller && onlinePeers.filter(p => p.location !== 'pair_room').length <= 1) {
      const stopRing = ringPlayer.startOutgoing();
      return () => { stopRing(); };
    } else {
      ringPlayer.stop();
    }
  }, [isCaller, onlinePeers]);

  // Derive Lobby Participants (ONLY peers who actually answered and connected to the live call!)
  const myEmailClean = user.email.trim().toLowerCase();
  const onlineOtherPeers = onlinePeers.filter(p => p.email && p.email.toLowerCase() !== myEmailClean);
  const otherCircleMembers = (circle.members || [])
    .map(m => String(m).trim().toLowerCase())
    .filter(m => m !== myEmailClean);

  const participants: ParticipantTileData[] = [
    {
      id: 'p_me',
      name: `أنت (${user.name})`,
      email: user.email,
      letter: user.name.charAt(0).toUpperCase() || 'أ',
      isMe: true,
      hasCam: camOn,
      isMuted: !micOn,
      location: 'lobby',
      assignedRoom: 'الساحة الجماعية'
    },
    ...onlineOtherPeers.map((peer, idx) => {
      const displayName = peer.name || peer.email.split('@')[0];
      return {
        id: peer.id || `peer_${idx}`,
        name: displayName,
        email: peer.email,
        letter: displayName.charAt(0).toUpperCase() || 'م',
        isMe: false,
        hasCam: peer.isCamOn,
        isMuted: !peer.isMicOn,
        location: peer.location || 'lobby',
        assignedRoom: peer.location === 'pair_room' ? `غرفة ${toArabicNumerals(peer.pairRoomNumber || 1)} معزولة` : 'الساحة'
      };
    })
  ];

  const lobbyParticipants = participants.filter(p => p.location === 'lobby' || p.isMe);

  // Invite Link Copy
  const [copiedLink, setCopiedLink] = useState(false);
  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?join=${circle.id}&circle=${encodeURIComponent(circle.name || '')}`
    : '';

  const handleCopyLink = () => {
    if (!inviteUrl) return;
    try {
      navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  // 1. Action: Start Paired Distribution (بدء التوزيع الثنائي)
  const handleStartSplit = async () => {
    setIsShuffling(true);
    setWaitingNotice(null);

    try {
      const res = await fetch('/api/breakout/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          circleId: circle.id,
          requesterEmail: user.email
        })
      });
      const data = await res.json();
      if (data.success && data.myAssignment) {
        setPendingAssignment({
          roomNumber: data.myAssignment.roomNumber,
          partnerName: data.myAssignment.partnerName,
          partnerEmail: data.myAssignment.partnerEmail,
          myRole: data.myAssignment.role
        });
        setShowSplitModal(true);
        setCountdown(3);
      } else if (data.status === 'odd_waiting') {
        setShowSplitModal(false);
        setWaitingNotice(data.message || 'أنت الحافظ الوحيد في الساحة حالياً. تم إدراجك في صالة الانتظار للمطابقة الفورية فور انضمام حافظ آخر، ولن تدخل في حلقة مغلقة مع نفسك.');
      } else {
        setShowSplitModal(false);
        setWaitingNotice(data.message || 'لا يوجد عدد كافٍ من الحفاظ في الساحة لبدء التوزيع الثنائي.');
      }
    } catch {
      setShowSplitModal(false);
      setWaitingNotice('تعذر الاتصال بخادم التوزيع. يرجى التحقق من الشبكة.');
    } finally {
      setIsShuffling(false);
    }
  };

  // Countdown timer for automatic entry into the pair room
  useEffect(() => {
    if (showSplitModal && !isShuffling) {
      if (countdown > 0) {
        timerRef.current = setTimeout(() => {
          setCountdown(c => c - 1);
        }, 1000);
      } else if (countdown === 0) {
        handleConfirmEnterPairRoom();
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [showSplitModal, isShuffling, countdown]);

  const handleConfirmEnterPairRoom = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowSplitModal(false);

    if (!pendingAssignment) return;

    teardownLobbyMedia();
    onEnterPairRoom({
      roomNumber: pendingAssignment.roomNumber,
      partnerName: pendingAssignment.partnerName,
      partnerEmail: pendingAssignment.partnerEmail,
      myRole: pendingAssignment.myRole
    });
  };

  // 2. Action: Pick a Partner (اختيار شريك)
  const handleSelectPartner = async (partnerEmail: string) => {
    const cleanMyEmail = user.email.trim().toLowerCase();
    const cleanPartnerEmail = partnerEmail.trim().toLowerCase();

    if (cleanMyEmail === cleanPartnerEmail) {
      setShowPickPartnerModal(false);
      setWaitingNotice('لا يمكنك اختيار نفسك كشريك للتسميع الثنائي.');
      return;
    }

    setShowPickPartnerModal(false);
    setWaitingNotice(null);

    try {
      const res = await fetch('/api/breakout/pick-partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          circleId: circle.id,
          myEmail: user.email,
          partnerEmail
        })
      });
      const data = await res.json();
      if (data.success && data.myAssignment) {
        teardownLobbyMedia();
        onEnterPairRoom({
          roomNumber: data.myAssignment.roomNumber || data.roomNumber || 1,
          partnerName: data.myAssignment.partnerName || data.partnerName || partnerEmail.split('@')[0],
          partnerEmail: data.myAssignment.partnerEmail || data.partnerEmail || partnerEmail,
          myRole: data.myAssignment.role || 'reciter'
        });
      } else {
        setWaitingNotice(data.error || 'تعذر بدء الجلسة مع هذا الشريك حالياً.');
      }
    } catch {
      setWaitingNotice('تعذر الاتصال بالخادم لمطابقة الشريك.');
    }
  };

  const handleToggleCam = () => {
    if (!hasMediaStream) {
      initMedia();
      return;
    }
    setCamOn(prev => !prev);
  };

  const handleToggleMic = () => {
    if (!hasMediaStream) {
      initMedia();
      return;
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    setMicOn(prev => !prev);
  };

  const handleExitCall = () => {
    ringPlayer.stop();
    teardownLobbyMedia();
    fetch('/api/live-call/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ circleId: circle.id, email: user.email })
    }).catch(() => {});
    onBackToGroup();
  };

  return (
    <div className="min-h-screen bg-[#070D1D] text-[#E7EBF8] flex flex-col font-['IBM_Plex_Sans_Arabic',sans-serif] relative select-none">
      
      {/* 1. TOP HEADER: Navigation & Exit */}
      <header className="px-4 py-3 border-b border-[#162544] bg-[#0A1428] flex items-center justify-between z-10 shadow-md">
        <button
          type="button"
          onClick={handleExitCall}
          className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#8CA2FF] hover:text-[#B2C2FF] transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>الدردشة والمجموعة</span>
        </button>

        {/* Center empty space as requested */}
        <div aria-hidden="true" />

        <button
          type="button"
          onClick={handleExitCall}
          className="flex items-center gap-1 bg-[#2C1014] hover:bg-[#E02E49] text-[#FF9A91] hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold border border-[#6E1C27] transition-all cursor-pointer shadow-sm active:scale-95"
        >
          <PhoneOff className="w-3.5 h-3.5" />
          <span>مغادرة الساحة</span>
        </button>
      </header>

      {/* 2. ACTION CONTROLS BAR: Paired Distribution & Pick Partner */}
      <section className="bg-[#0E1B38] border-b border-[#1A2E5A] px-4 py-3">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
          
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#6FD39A] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#6FD39A]"></span>
            </span>
            <span className="text-xs font-semibold text-[#E7EBF8]">
              {lobbyParticipants.length === 1 ? (
                <span>١ متواجد في الساحة (بانتظار رد وانضمام بقية الأعضاء...)</span>
              ) : (
                <span>{toArabicNumerals(lobbyParticipants.length)} متواجدون في الساحة الجماعية</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Primary Action 1: Start Paired Distribution */}
            <button
              type="button"
              onClick={handleStartSplit}
              className="flex items-center gap-2 bg-[#27409E] hover:bg-[#3451B8] active:bg-[#1E3380] text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95"
            >
              <Shuffle className="w-3.5 h-3.5 text-[#8CA2FF]" />
              <span>بدء التوزيع الثنائي</span>
            </button>

            {/* Primary Action 2: Choose a Partner */}
            <button
              type="button"
              onClick={() => setShowPickPartnerModal(true)}
              className="flex items-center gap-2 bg-[#1C2E58] hover:bg-[#253D74] text-[#E7EBF8] border border-[#2A4582] px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 shadow-sm"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#8CA2FF]" />
              <span>اختيار شريك</span>
            </button>
          </div>
        </div>
      </section>

      {/* 3. ACTIVE BREAKOUT ROOMS BADGE (Shows isolated sessions in progress) */}
      {activeBreakoutRooms.length > 0 && (
        <section className="bg-[#121A33]/80 border-b border-[#27325A] px-4 py-2">
          <div className="max-w-4xl mx-auto flex items-center gap-2 overflow-x-auto text-xs text-[#9AA7C9] py-1">
            <span className="flex items-center gap-1 text-[#8CA2FF] font-bold shrink-0">
              <Lock className="w-3 h-3 text-[#F2C14E]" />
              <span>غرف ثنائية جارية (صوت معزول 🔒):</span>
            </span>
            {activeBreakoutRooms.map((room) => (
              <div
                key={room.roomNumber}
                className="bg-[#1A2444] border border-[#2A3B6B] rounded-lg px-2.5 py-1 shrink-0 flex items-center gap-1.5 text-[11px] text-[#E7EBF8]"
              >
                <span className="font-bold text-[#F2C14E]">غرفة {toArabicNumerals(room.roomNumber)}:</span>
                <span>{room.user1Name} + {room.user2Name}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. MAIN LOBBY GRID: Grid of participants in the main lobby */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 flex flex-col justify-center">
        {waitingNotice && (
          <div className="bg-[#121E3B] border border-[#233F7D] rounded-2xl p-4 mb-4 flex items-center justify-between gap-3 text-xs text-[#E2E8F0] shadow-md animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#1C3266] flex items-center justify-center text-[#8CA2FF] shrink-0 font-bold text-base">
                ⏳
              </div>
              <div>
                <p className="font-bold text-white mb-0.5">صالة انتظار الشريك</p>
                <p className="text-[11px] text-[#A6B8DD] leading-relaxed">{waitingNotice}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWaitingNotice(null)}
              className="text-[#8CA2FF] hover:text-white px-3 py-1.5 rounded-xl border border-[#233F7D] text-xs font-semibold cursor-pointer transition-colors shrink-0"
            >
              حسناً
            </button>
          </div>
        )}

        {mediaError && (
          <div className="bg-[#142347] border border-[#233F7D] rounded-2xl p-3.5 mb-4 flex items-center justify-between text-xs text-[#CBD5E1]">
            <span>{mediaError}</span>
            <button
              onClick={() => initMedia()}
              className="bg-[#27409E] hover:bg-[#3451B8] text-white px-3 py-1.5 rounded-xl font-bold cursor-pointer text-xs"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5 auto-rows-fr">
          {participants.map((p) => {
            const isLocal = p.isMe;
            const inBreakout = p.location === 'pair_room';

            return (
              <div
                key={p.id}
                className={`relative aspect-4/3 rounded-2xl overflow-hidden border bg-[#0C152B] flex flex-col items-center justify-center p-3 text-center transition-all ${
                  isLocal && isSpeaking ? 'speaking-border border-[#1B7A3E]' : 'border-[#1C2C54]'
                } ${inBreakout ? 'opacity-50 ring-1 ring-[#F2C14E]/30' : ''}`}
              >
                {/* Video Track or Octagram Avatar */}
                {isLocal && camOn && hasMediaStream ? (
                  <video
                    ref={setLocalVideoNode}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[#18274B] border border-[#273B6E] flex items-center justify-center text-white mb-2 shadow-inner">
                    <OctagramBadge letter={p.letter} size={44} />
                  </div>
                )}

                {/* Status Overlays */}
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
                  {p.isMuted ? (
                    <div className="w-6 h-6 rounded-full bg-[#381216]/90 border border-[#7F232D] text-[#FF9A91] flex items-center justify-center shadow">
                      <MicOff className="w-3.5 h-3.5" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[#102B1D]/90 border border-[#2D734B] text-[#6FD39A] flex items-center justify-center shadow">
                      <Mic className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                {/* Location Badge (Lobby vs Pair Room) */}
                <div className="absolute top-2.5 left-2.5 z-10">
                  {inBreakout ? (
                    <span className="flex items-center gap-1 bg-[#3A2F12]/90 border border-[#C58A1B]/50 text-[#F2C14E] text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                      <Lock className="w-2.5 h-2.5" />
                      <span>{p.assignedRoom}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 bg-[#102B1D]/80 border border-[#2D734B]/60 text-[#6FD39A] text-[10px] font-semibold px-2 py-0.5 rounded-full shadow">
                      <span>الساحة</span>
                    </span>
                  )}
                </div>

                {/* Bottom Name Plate */}
                <div className="absolute bottom-2 inset-x-2 bg-black/60 backdrop-blur-xs rounded-xl px-2.5 py-1.5 flex items-center justify-between text-xs text-white z-10 border border-white/10">
                  <span className="font-semibold truncate max-w-[120px]">{p.name}</span>
                  {isLocal && (
                    <span className="text-[10px] text-[#8CA2FF] bg-[#14244B] px-1.5 py-0.5 rounded font-bold">
                      أنت
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* 5. BOTTOM BAR: Media Controls */}
      <footer className="p-4 bg-[#0A1428] border-t border-[#162544] flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={handleToggleMic}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md active:scale-95 ${
            micOn ? 'bg-[#182B55] hover:bg-[#20366A] text-[#8CA2FF] border border-[#2F4A88]' : 'bg-[#E02E49] text-white hover:bg-[#C9223C]'
          }`}
          title={micOn ? 'كتم المايكروفون' : 'تشغيل المايكروفون'}
        >
          {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={handleToggleCam}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md active:scale-95 ${
            camOn ? 'bg-[#182B55] hover:bg-[#20366A] text-[#8CA2FF] border border-[#2F4A88]' : 'bg-[#E02E49] text-white hover:bg-[#C9223C]'
          }`}
          title={camOn ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'}
        >
          {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={handleStartSplit}
          className="h-12 px-6 rounded-full bg-[#27409E] hover:bg-[#3451B8] text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg transition-all cursor-pointer active:scale-95"
        >
          <Shuffle className="w-4 h-4 text-[#8CA2FF]" />
          <span>بدء التوزيع الثنائي للغرف</span>
        </button>
      </footer>

      {/* 6. SHUFFLE / SPLIT MODAL (Countdown into Breakout Room) */}
      {showSplitModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0C1630] border border-[#273860] rounded-2xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-full bg-[#14244B] border border-[#2A4582] text-[#8CA2FF] flex items-center justify-center mx-auto shadow-md">
              <Shuffle className={`w-8 h-8 ${isShuffling ? 'animate-spin' : ''}`} />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">
                {isShuffling ? 'جارٍ التوزيع الثنائي للغرف...' : 'تم التوزيع الثنائي بنجاح!'}
              </h3>
              <p className="text-xs text-[#95A7CE] leading-relaxed">
                {isShuffling
                  ? 'يتم الآن فرز المشاركين في الساحة وتوزيعهم 2 بـ 2 في غرف تسميع معزولة...'
                  : `أنت في غرفة ${toArabicNumerals(pendingAssignment?.roomNumber || 1)} مع الشريك (${pendingAssignment?.partnerName || 'الحافظ'}). الصوت معزول تماماً.`}
              </p>
            </div>

            {!isShuffling && (
              <div className="bg-[#121E3D] border border-[#213565] rounded-xl p-3 text-xs text-[#8CA2FF] space-y-1">
                <div className="flex items-center justify-between font-bold">
                  <span>الدخول التلقائي للغرفة:</span>
                  <span className="text-base text-white bg-[#27409E] w-7 h-7 rounded-full flex items-center justify-center">
                    {toArabicNumerals(countdown)}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-[#A7F3D0]">
                  <Lock className="w-3 h-3" />
                  <span>غرفة معزولة لا يسمعكم أي شخص في الساحة</span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (timerRef.current) clearTimeout(timerRef.current);
                  setShowSplitModal(false);
                }}
                className="flex-1 bg-[#142347] hover:bg-[#1B2F5C] text-[#8CA2FF] py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleConfirmEnterPairRoom}
                className="flex-1 bg-[#27409E] hover:bg-[#3451B8] text-white py-2.5 rounded-xl text-xs font-bold shadow-md cursor-pointer active:scale-95"
              >
                ادخل الآن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. CHOOSE PARTNER MODAL ("اختيار شريك للتسميع الثنائي") */}
      {showPickPartnerModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0C1630] border border-[#273860] rounded-2xl max-w-md w-full p-6 text-right space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#1A2E5A] pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#8CA2FF]" />
                <h3 className="text-base font-bold text-white">اختيار شريك للتسميع الثنائي</h3>
              </div>
              <button
                onClick={() => setShowPickPartnerModal(false)}
                className="text-xs text-[#9AA7C9] hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#95A7CE] leading-relaxed">
              اختر أي حافظ متواجد في الساحة لبدء جلسة تسميع ثنائية معزولة فوراً:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {otherCircleMembers.length === 0 ? (
                <div className="text-center py-6 text-xs text-[#9AA7C9]">
                  لا يوجد أعضاء آخرون متواجدون حالياً.
                </div>
              ) : (
                otherCircleMembers.map((mEmail) => {
                  const displayName = mEmail.split('@')[0];
                  const peer = onlinePeers.find(p => p.email.toLowerCase() === mEmail);
                  const inBreakout = peer?.location === 'pair_room';

                  return (
                    <div
                      key={mEmail}
                      className="bg-[#121E3D] border border-[#213565] rounded-xl p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-[#18274B] border border-[#2A4582] text-[#8CA2FF] flex items-center justify-center font-bold text-xs">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-white">{displayName}</div>
                          <div className="text-[10px] text-[#9AA7C9]">
                            {inBreakout ? 'في غرفة ثنائية أخرى 🔒' : 'متواجد في الساحة ✓'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={inBreakout}
                        onClick={() => handleSelectPartner(mEmail)}
                        className="bg-[#27409E] hover:bg-[#3451B8] disabled:opacity-40 disabled:hover:bg-[#27409E] text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow cursor-pointer transition-all active:scale-95"
                      >
                        بدء التسميع معه
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowPickPartnerModal(false)}
                className="w-full bg-[#142347] hover:bg-[#1B2F5C] text-[#8CA2FF] py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
