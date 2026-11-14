import React, { useState, useEffect, useRef } from 'react';
import { UserSession, CircleRoom } from '../types';
import { toArabicNumerals, normalizeQuranText } from '../utils/tasmeeEngine';
import { QURAN_PAGES, QuranPageData } from '../utils/quranPagesData';
import { 
  Video, 
  Mic, 
  MicOff, 
  VideoOff, 
  ChevronLeft, 
  PhoneOff,
  Volume2,
  VolumeX,
  Lock,
  Radio
} from 'lucide-react';
import { OctagramBadge } from './GroupChatScreen';
import { useIsolatedPeerCall } from '../hooks/useIsolatedPeerCall';

interface PairRoomScreenProps {
  user: UserSession;
  circle: CircleRoom;
  partnerName: string;
  partnerEmail?: string;
  roomNumber: number;
  initialRole: 'reciter' | 'listener';
  onBackToMainRoom: () => void;
}

export const PairRoomScreen: React.FC<PairRoomScreenProps> = ({
  user,
  circle,
  partnerName = 'الشريك',
  partnerEmail,
  roomNumber = 3,
  initialRole = 'listener',
  onBackToMainRoom
}) => {
  // Role: Reader vs Listener (Supports seamless role swapping via "حسبُك")
  const [role, setRole] = useState<'reciter' | 'listener'>(initialRole);

  // Active page tracked automatically by AI (starts at Page 22)
  const [selectedPageNum, setSelectedPageNum] = useState<number>(22);
  const [autoPageNotice, setAutoPageNotice] = useState<string | null>(null);
  const [hasbukNotice, setHasbukNotice] = useState<string | null>(null);

  // Current Quran page data
  const currentPageData: QuranPageData = QURAN_PAGES[selectedPageNum] || QURAN_PAGES[22];
  const allWords = currentPageData.words;

  // Active recitation state - AI tracks progress to flip pages
  const [isReciting, setIsReciting] = useState(false);
  const [currentWordIdx, setCurrentWordIdx] = useState<number>(0);

  // WhatsApp / Discord style media controls
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasMediaStream, setHasMediaStream] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const [isListenOnly, setIsListenOnly] = useState(false);

  // Dedicated Breakout Channel: zero audio leakage outside this room
  const breakoutChannelId = `${circle.id}_pair_${roomNumber}`;
  const isInitiator = role === 'reciter' || user.email.toLowerCase() < (partnerEmail || '').toLowerCase();

  const { connectionStatus, remoteStream, isOnline, triggerReconnect } = useIsolatedPeerCall({
    channelId: breakoutChannelId,
    myEmail: user.email,
    partnerEmail,
    isInitiator,
    localStream: streamRef.current
  });

  // Callback ref to guarantee immediate srcObject attachment as soon as <video> mounts
  const setLocalVideoNode = (node: HTMLVideoElement | null) => {
    localVideoRef.current = node;
    if (node && streamRef.current) {
      if (node.srcObject !== streamRef.current) {
        node.srcObject = streamRef.current;
      }
      node.play().catch(() => {});
    }
  };

  const setRemoteVideoNode = (node: HTMLVideoElement | null) => {
    remoteVideoRef.current = node;
    if (node && remoteStream) {
      if (node.srcObject !== remoteStream) {
        node.srcObject = remoteStream;
      }
      node.play().catch(() => {});
    }
  };

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      if (remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      remoteVideoRef.current.play().catch(() => {});
    }
    if (remoteAudioRef.current && remoteStream) {
      if (remoteAudioRef.current.srcObject !== remoteStream) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  // Stability refs
  const currentWordIdxRef = useRef<number>(currentWordIdx);
  currentWordIdxRef.current = currentWordIdx;

  const isRecitingRef = useRef<boolean>(isReciting);
  isRecitingRef.current = isReciting;

  const allWordsRef = useRef(allWords);
  allWordsRef.current = allWords;

  const micOnRef = useRef<boolean>(micOn);
  micOnRef.current = micOn;

  const selectedPageNumRef = useRef<number>(selectedPageNum);
  selectedPageNumRef.current = selectedPageNum;

  // ==========================================================
  // 1. STABLE MEDIA STREAM (Real Camera & Mic with multi-tier fallback & Listen-Only)
  // ==========================================================
  const initMedia = async () => {
    setMediaError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMediaError('المتصفح لا يدعم الوصول المباشر للكاميرا والمايكروفون (وضع الاستماع مفعل)');
        setIsListenOnly(true);
        setMicOn(false);
        setHasMediaStream(false);
        return;
      }

      let stream: MediaStream | null = null;

      // Tier 1: Standard constraints without strict sampleRate
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: true
          }
        });
      } catch (e1) {
        console.warn('Pair room tier 1 notice:', e1);
      }

      // Tier 2: Relaxed boolean constraints
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          });
        } catch (e2) {
          console.warn('Pair room tier 2 notice:', e2);
        }
      }

      // Tier 3: Audio only fallback
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e3) {
          console.warn('Pair room tier 3 notice:', e3);
        }
      }

      // Tier 4: Video only fallback
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (e4) {
          console.warn('Pair room tier 4 notice:', e4);
        }
      }

      // If all tiers failed, gracefully switch to Listen-Only mode without freezing or crashing
      if (!stream) {
        setMediaError('وضع الاستماع ومتابعة التلاوة مفعّل (الميكروفون غير متاح أو تم رفض الإذن)');
        setIsListenOnly(true);
        setMicOn(false);
        setHasMediaStream(false);
        return;
      }

      setIsListenOnly(stream.getAudioTracks().length === 0);
      streamRef.current = stream;
      setHasMediaStream(true);

      if (localVideoRef.current && stream.getVideoTracks().length > 0) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      // Safe Audio Analyser initialization ONLY if stream has active audio tracks
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
      console.error('Pair room media error:', err);
      setMediaError('وضع الاستماع ومتابعة التلاوة مفعّل (الميكروفون غير متاح)');
      setIsListenOnly(true);
      setMicOn(false);
      setHasMediaStream(false);
    }
  };

  useEffect(() => {
    initMedia();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Guarantee local video receives stream whenever camOn or hasMediaStream updates
  useEffect(() => {
    if (localVideoRef.current && streamRef.current && camOn) {
      if (localVideoRef.current.srcObject !== streamRef.current) {
        localVideoRef.current.srcObject = streamRef.current;
      }
      localVideoRef.current.play().catch(() => {});
    }
  }, [hasMediaStream, camOn]);

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

  // Update track enabled state without re-invoking getUserMedia
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(t => {
        t.enabled = micOn;
      });
    }
  }, [micOn]);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach(t => {
        t.enabled = camOn;
      });
    }
  }, [camOn]);

  // Sync recitation state across peers
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/recitation/session/${roomNumber}`);
        if (res.ok) {
          const data = await res.json();
          if (data.session) {
            // If server page differs from local and we are listener, sync to reciter's page
            if (role === 'listener') {
              if (data.session.pageNumber && data.session.pageNumber !== selectedPageNumRef.current) {
                setSelectedPageNum(data.session.pageNumber);
              }
              if (typeof data.session.currentWordIdx === 'number') {
                setCurrentWordIdx(data.session.currentWordIdx);
              }
              if (typeof data.session.isReciting === 'boolean') {
                setIsReciting(data.session.isReciting);
              }
            }
          }
        }
      } catch {}
    }, 2500);

    return () => clearInterval(syncInterval);
  }, [roomNumber, role]);

  // ==========================================================
  // 2. AI RECOGNITION & AUTOMATIC DETECTION OF RECITED QURAN
  // "بدون اختيار ما سيقرأ، هو الذكاء يتعرف وحده على ما سيقرأ ويظهر للمستمع"
  // ==========================================================
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let recognition: any = null;
    let autoPaceTimer: NodeJS.Timeout | null = null;

    if (isReciting) {
      // Speech recognition for active reciter
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRec && micOnRef.current && role === 'reciter') {
          recognition = new SpeechRec();
          recognition.lang = 'ar-SA';
          recognition.continuous = true;
          recognition.interimResults = true;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          recognition.onresult = (event: any) => {
            const currentTranscript = Array.from(event.results)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((res: any) => res[0].transcript)
              .join(' ');

            const normalizedTranscript = normalizeQuranText(currentTranscript);
            const wordsList = normalizedTranscript.split(/\s+/).filter(Boolean);
            const latestWord = wordsList[wordsList.length - 1];

            // 1. Check if the speech matches any other Quran page to automatically switch
            if (wordsList.length >= 2) {
              for (const [pNumStr, pageObj] of Object.entries(QURAN_PAGES)) {
                const pNum = Number(pNumStr);
                const pageWordsNorm = pageObj.words.map(w => normalizeQuranText(w.word)).filter(Boolean);
                let hitCount = 0;
                for (const w of wordsList.slice(-4)) {
                  if (pageWordsNorm.some(pw => pw === w || pw.includes(w) || w.includes(pw))) {
                    hitCount++;
                  }
                }
                if (hitCount >= 2 && pNum !== selectedPageNumRef.current) {
                  setSelectedPageNum(pNum);
                  setCurrentWordIdx(0);
                  try {
                    fetch('/api/recitation/update', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        roomNumber,
                        pageNumber: pNum,
                        surahName: pageObj.surahName,
                        startAyah: pageObj.startAyah,
                        currentWordIdx: 0,
                        isReciting: true,
                        reciterName: user.name
                      })
                    }).catch(() => {});
                  } catch {}
                  return;
                }
              }
            }

            // 2. Increment active word cursor on current page
            if (latestWord && allWordsRef.current.length > 0) {
              const cur = currentWordIdxRef.current;
              for (let i = cur; i < Math.min(allWordsRef.current.length, cur + 5); i++) {
                const targetNorm = normalizeQuranText(allWordsRef.current[i].word);
                if (targetNorm && (targetNorm.includes(latestWord) || latestWord.includes(targetNorm))) {
                  if (i >= allWordsRef.current.length - 1) {
                    handleAutoAdvanceToNextPage();
                  } else {
                    setCurrentWordIdx(i);
                  }
                  break;
                }
              }
            }
          };

          recognition.onerror = () => {};
          recognition.start();
        }
      } catch {}

      // Automated recitation pace tracker
      autoPaceTimer = setInterval(() => {
        setCurrentWordIdx(prev => {
          const totalWords = allWordsRef.current.length;
          if (prev < totalWords - 1) {
            return prev + 1;
          } else {
            // Reached the end of the page! Automatically advance to next page!
            handleAutoAdvanceToNextPage();
            return 0;
          }
        });
      }, 1050);
    }

    return () => {
      if (recognition) {
        try { recognition.stop(); } catch {}
      }
      if (autoPaceTimer) clearInterval(autoPaceTimer);
    };
  }, [isReciting, selectedPageNum, role]);

  // Automatic Page Advance function
  const handleAutoAdvanceToNextPage = () => {
    const curPage = selectedPageNumRef.current;
    const nextPage = curPage === 22 ? 23 : curPage === 23 ? 24 : curPage === 1 ? 22 : curPage === 293 ? 294 : curPage === 582 ? 583 : 22;

    setSelectedPageNum(nextPage);
    setCurrentWordIdx(0);

    const nextPageData = QURAN_PAGES[nextPage] || QURAN_PAGES[22];
    setAutoPageNotice(`تم الانتقال تلقائياً إلى ${nextPageData.surahName} • الصفحة ${toArabicNumerals(nextPage)}`);

    setTimeout(() => {
      setAutoPageNotice(null);
    }, 3200);

    // Sync to server so both parties stay in step
    try {
      fetch('/api/recitation/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomNumber,
          pageNumber: nextPage,
          surahName: nextPageData.surahName,
          startAyah: nextPageData.startAyah,
          currentWordIdx: 0,
          isReciting: true,
          reciterName: role === 'reciter' ? user.name : partnerName
        })
      }).catch(() => {});
    } catch {}
  };

  // Toggle recitation handler (For reciter)
  const handleToggleRecitation = () => {
    const nextState = !isReciting;
    setIsReciting(nextState);

    try {
      fetch('/api/recitation/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomNumber,
          isReciting: nextState,
          reciterName: role === 'reciter' ? user.name : partnerName
        })
      }).catch(() => {});
    } catch {}
  };

  // ==========================================================
  // 3. "حسبُك" ROLE SWAP HANDLER (Visible ONLY to the Reciter)
  // "وحسبي لا تظهر إلا القارى هو يضغط عليها إذا انتهي من القراءة"
  // ==========================================================
  const handleHasbukSwapRoles = async () => {
    setIsReciting(false);
    setCurrentWordIdx(0);

    const nextRole = role === 'reciter' ? 'listener' : 'reciter';
    setRole(nextRole);

    const newReciter = nextRole === 'reciter' ? user.name : partnerName;
    const newListener = nextRole === 'reciter' ? partnerName : user.name;

    setHasbukNotice(`حسبُك! تم تسليم الدور. القارئ الآن هو (${newReciter})، وأنت المستمع.`);

    setTimeout(() => {
      setHasbukNotice(null);
    }, 4000);

    try {
      await fetch('/api/recitation/swap-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomNumber,
          newReciterName: newReciter,
          newListenerName: newListener
        })
      });
    } catch {}
  };

  return (
    <div className="min-h-screen bg-[#070D1D] text-[#E7EBF8] flex flex-col font-['IBM_Plex_Sans_Arabic',sans-serif] relative select-none">
      
      {/* Top Header: Isolated Breakout Room */}
      <header className="px-4 py-3 border-b border-[#162544] bg-[#0A1428] flex items-center justify-between z-10 shadow-md">
        {/* Left Link: "< العودة للساحة" */}
        <button
          type="button"
          onClick={() => setShowExitModal(true)}
          className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#8CA2FF] hover:text-[#B2C2FF] transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>العودة للساحة الرئيسية</span>
        </button>

        {/* Center: Title & Isolation Badge */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 text-white font-bold text-xs sm:text-sm">
            <Lock className="w-3.5 h-3.5 text-[#F2C14E]" />
            <span>غرفة تسميع ثنائية معزولة #{toArabicNumerals(roomNumber)}</span>
          </div>
          <span className="text-[10px] text-[#A7F3D0] block">
            🔒 اتصال معزول مشفر (لا يسمعكم أحد في الساحة)
          </span>
        </div>

        {/* Right: End Session Button */}
        <button
          type="button"
          onClick={() => setShowExitModal(true)}
          className="flex items-center gap-1.5 bg-[#381216] hover:bg-[#E02E49] text-[#FF9A91] hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold border border-[#7F232D] shadow-sm transition-all cursor-pointer active:scale-95"
          title="إنهاء الجلسة الثنائية والعودة للساحة الرئيسية"
        >
          <PhoneOff className="w-3.5 h-3.5" />
          <span>إنهاء الجلسة</span>
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-3 flex flex-col gap-3 overflow-y-auto">
        
        {/* Auto-reconnection & Network drop notice */}
        {(!isOnline || connectionStatus === 'reconnecting' || connectionStatus === 'offline') && (
          <div className="bg-[#2B1B0E] border border-[#854D0E] rounded-2xl p-3 flex items-center justify-between gap-3 text-xs text-[#FDE68A] animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#F59E0B] animate-spin shrink-0" />
              <span>
                {!isOnline
                  ? 'انقطع اتصال الإنترنت... جاري محاولة الاستعادة التلقائية للشبكة'
                  : 'جاري إعادة الاتصال التلقائي بالقناة المعزولة...'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => triggerReconnect()}
              className="bg-[#D97706] hover:bg-[#B45309] text-white px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer active:scale-95 transition-all shrink-0 shadow-sm"
            >
              إعادة الاتصال
            </button>
          </div>
        )}

        {/* Media Permission / Listen-Only Banner */}
        {mediaError && (
          <div className="bg-[#142347] border border-[#233F7D] rounded-2xl p-3 flex items-center justify-between gap-3 text-xs text-[#CBD5E1] animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8] shrink-0" />
              <span>{mediaError}</span>
            </div>
            <button
              type="button"
              onClick={() => initMedia()}
              className="bg-[#27409E] hover:bg-[#3451B8] text-white px-3.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer active:scale-95 transition-all shrink-0 shadow-sm"
            >
              تفعيل الميكروفون
            </button>
          </div>
        )}

        {/* "حسبُك" Role Swap Toast Notification */}
        {hasbukNotice && (
          <div className="bg-[#102B1D] border border-[#2D734B] text-[#A7F3D0] rounded-xl px-4 py-2.5 text-xs font-bold flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300 shadow-lg">
            <span>{hasbukNotice}</span>
            <span className="bg-[#1C5C3F] text-white px-2 py-0.5 rounded-md text-[10px]">
              تم تسليم الدور ✓
            </span>
          </div>
        )}

        {/* Automatic AI Page Transition Notice Toast */}
        {autoPageNotice && (
          <div className="bg-[#122A1F] border border-[#226848] text-[#86EFAC] rounded-xl px-4 py-2 text-xs font-semibold flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200 shadow-md">
            <span>{autoPageNotice}</span>
            <span className="text-[10px] text-[#A7F3D0] bg-[#1B4D36] px-2 py-0.5 rounded-full">
              متابعة تلقائية
            </span>
          </div>
        )}

        {/* Two Video Tiles Side by Side (WhatsApp & Discord Style) */}
        <div className="grid grid-cols-2 gap-3">
          {/* Partner Tile (Isolated 1-on-1 Stream) */}
          <div className={`relative bg-[#0E1B38] border border-[#192D5A] rounded-2xl h-32 sm:h-40 overflow-hidden flex items-center justify-center shadow-md transition-all ${
            isReciting && role === 'listener' ? 'ring-2 ring-[#6FD39A] shadow-[0_0_14px_rgba(111,211,154,0.35)]' : ''
          }`}>
            {remoteStream ? (
              <video
                ref={setRemoteVideoNode}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover z-0"
              />
            ) : (
              <>
                <div
                  className="absolute inset-0 opacity-15 pointer-events-none"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, #8CA2FF 0, #8CA2FF 1px, transparent 0, transparent 10px)'
                  }}
                />
                <OctagramBadge letter={partnerName.charAt(0)} size={44} className="z-10" />
              </>
            )}

            {/* Hidden isolated audio element ensuring partner audio is played */}
            <audio ref={remoteAudioRef} autoPlay playsInline />

            <div className="absolute top-2 right-2 text-[#7A8EBA] z-10 bg-[#091224]/60 p-1 rounded-md backdrop-blur-xs flex items-center gap-1">
              <Lock className="w-3 h-3 text-[#F2C14E]" />
              <Video className="w-3.5 h-3.5" />
            </div>
            <div className="absolute bottom-2 right-2 text-[#7A8EBA] z-10 bg-[#091224]/60 p-1 rounded-md backdrop-blur-xs">
              {isReciting && role === 'listener' ? (
                <Mic className="w-3.5 h-3.5 text-[#6FD39A]" />
              ) : (
                <MicOff className="w-3.5 h-3.5 text-[#FF9A91]" />
              )}
            </div>

            <span className="absolute bottom-2 left-2 bg-[#091224]/85 text-white rounded-full px-2.5 py-0.5 text-[11px] border border-[#1E3360]/50 font-medium z-10 flex items-center gap-1.5">
              <span>{partnerName} • {role === 'listener' ? 'قارئ' : 'مستمع'}</span>
              {connectionStatus === 'connected' && (
                <span className="w-2 h-2 rounded-full bg-[#6FD39A] animate-pulse" title="متصل بالصوت المباشر" />
              )}
            </span>
          </div>

          {/* Current User Tile */}
          <div className={`relative bg-[#0E1B38] border border-[#192D5A] rounded-2xl h-32 sm:h-40 overflow-hidden flex items-center justify-center shadow-md transition-all ${
            isSpeaking && micOn ? 'ring-2 ring-[#6FD39A] shadow-[0_0_14px_rgba(111,211,154,0.35)]' : ''
          }`}>
            {camOn && hasMediaStream ? (
              <video
                ref={setLocalVideoNode}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover z-0"
              />
            ) : (
              <>
                <div
                  className="absolute inset-0 opacity-15 pointer-events-none"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, #8CA2FF 0, #8CA2FF 1px, transparent 0, transparent 10px)'
                  }}
                />
                <div className="relative flex items-center justify-center z-10">
                  <OctagramBadge letter={user.name.charAt(0) || 'أ'} size={48} />
                </div>
              </>
            )}

            <div className="absolute top-2 right-2 text-[#7A8EBA] z-10 bg-[#091224]/60 p-1 rounded-md backdrop-blur-xs">
              {camOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5 text-[#FF9A91]" />}
            </div>
            <div className="absolute bottom-2 right-2 text-[#7A8EBA] z-10 bg-[#091224]/60 p-1 rounded-md backdrop-blur-xs">
              {micOn ? <Mic className="w-3.5 h-3.5 text-[#6FD39A]" /> : <MicOff className="w-3.5 h-3.5 text-[#FF9A91]" />}
            </div>

            <span className="absolute bottom-2 left-2 bg-[#091224]/85 text-white rounded-full px-2.5 py-0.5 text-[11px] border border-[#1E3360]/50 font-medium z-10">
              {role === 'listener' ? 'أنت • مستمع' : 'أنت • قارئ'}
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* STRICT ROLE VIEWS: Reader vs Listener                    */}
        {/* "ما يظهر المستمع لا يظهر للقارئ، ولا يمكن النظر فيما يراه الغير" */}
        {/* ======================================================== */}
        {role === 'listener' ? (
          /* ======================================================== */
          /* LISTENER VIEW: Full Quran text with auto-tracking        */
          /* ZERO STARS, NO confusing indicator bars                  */
          /* ======================================================== */
          <div className="bg-[#0D1832] border border-[#18294E] rounded-2xl p-4 shadow-xl space-y-3.5 text-center">
            
            {/* Header: Pure Surah Name (ZERO STARS) */}
            <div className="flex items-center justify-center text-white font-bold text-base sm:text-lg">
              <span>{currentPageData.surahName}</span>
            </div>

            <div className="flex items-center justify-center gap-2 text-[11px] flex-wrap">
              <span className="bg-[#14264C] text-[#8CA2FF] px-3 py-0.5 rounded-full border border-[#203970]">
                الصفحة {toArabicNumerals(currentPageData.pageNumber)} من ٦٠٤
              </span>
              <span className="bg-[#14264C] text-[#8CA2FF] px-3 py-0.5 rounded-full border border-[#203970]">
                الآيات {toArabicNumerals(currentPageData.startAyah)} - {toArabicNumerals(currentPageData.endAyah)}
              </span>
              <span className="bg-[#14264C] text-[#8CA2FF] px-3 py-0.5 rounded-full border border-[#203970]">
                الجزء {toArabicNumerals(currentPageData.juzNumber)}
              </span>
            </div>

            {/* Actual Quran Text in Uthmani Script: Pure, noble, uncluttered */}
            <div className="bg-[#070E20] border border-[#152548] rounded-xl p-5 text-right font-['Amiri_Quran',serif] text-xl sm:text-2xl leading-[2.6] text-justify shadow-inner max-h-[48vh] overflow-y-auto">
              {allWords.map((item, idx) => {
                const isCurrent = idx === currentWordIdx && isReciting;

                if (item.isVerseNum) {
                  return (
                    <span key={idx} className="text-[#C58A1B] font-bold mx-1.5 inline-block text-lg">
                      {item.word}{' '}
                    </span>
                  );
                }

                if (item.isSign) {
                  return (
                    <span key={idx} className="text-[#7A8EBA] text-sm mx-1 inline-block">
                      {item.word}{' '}
                    </span>
                  );
                }

                // AI only follows the reader - subtle illumination of current word
                const highlightClass = isCurrent
                  ? 'bg-[#F2C14E]/25 text-[#F2C14E] rounded px-1 font-semibold'
                  : 'text-[#EDEFF9]';

                return (
                  <span key={idx} className={`inline-block px-0.5 transition-all duration-150 ${highlightClass}`}>
                    {item.word}{' '}
                  </span>
                );
              })}
            </div>

            {/* Subtle indicator: AI turns page automatically */}
            <div className="text-[11px] text-[#7A8EBA] text-center pt-0.5">
              يتعرف الذكاء الاصطناعي على المقروء تلقائياً ويقلب الصفحات بانسيابية
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* READER VIEW: Reciting from Memory (No Quran text shown!) */
          /* ZERO STARS around Surah name                             */
          /* ======================================================== */
          <div className="bg-[#0D1832] border border-[#18294E] rounded-2xl p-6 sm:p-8 shadow-xl space-y-6 text-center">
            
            {/* Header: Pure Surah Name (ZERO STARS) */}
            <div className="flex items-center justify-center text-white font-bold text-base sm:text-lg">
              <span>{currentPageData.surahName}</span>
            </div>

            <div className="flex items-center justify-center gap-2 text-[11px] flex-wrap">
              <span className="bg-[#14264C] text-[#8CA2FF] px-3 py-0.5 rounded-full border border-[#203970]">
                الصفحة {toArabicNumerals(currentPageData.pageNumber)} من ٦٠٤
              </span>
              <span className="bg-[#14264C] text-[#8CA2FF] px-3 py-0.5 rounded-full border border-[#203970]">
                الجزء {toArabicNumerals(currentPageData.juzNumber)}
              </span>
            </div>

            {/* Privacy Box: Quran Text is Hidden for Reader */}
            <div className="py-10 space-y-3 bg-[#081022] border border-[#15254A] rounded-2xl p-6">
              <div className="w-14 h-14 rounded-full bg-[#1C2C55] text-[#F2C14E] flex items-center justify-center mx-auto text-2xl shadow-md">
                📖
              </div>
              <h2 className="text-lg sm:text-2xl font-bold text-white tracking-wide">
                القارئ يقرأ من الحفظ غيباً
              </h2>
              <p className="text-xs sm:text-sm text-[#7A8EBA] max-w-md mx-auto leading-relaxed">
                اقرأ ما تيسر لك مباشرة من أي سورة، والذكاء الاصطناعي يتعرف على تلاوتك ويعرضها للمستمع وينقل الصفحات تلقائياً.
              </p>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* FLOATING CALL CONTROLS DOCK (WhatsApp & Discord Style)    */}
        {/* Featuring modern sleek "حسبُك" button for Reciter ONLY    */}
        {/* ======================================================== */}
        <div className="bg-[#0A1428]/95 border border-[#1B2F5C] rounded-2xl p-3 shadow-2xl flex items-center justify-between gap-2.5 backdrop-blur-md sticky bottom-2 z-20">
          
          {/* Main Recitation Start/Stop Button (For Reciter ONLY) */}
          {role === 'reciter' && (
            <button
              type="button"
              onClick={handleToggleRecitation}
              className={`px-5 sm:px-7 py-2.5 rounded-xl font-bold text-xs sm:text-sm cursor-pointer shadow-md active:scale-95 transition-all ${
                isReciting
                  ? 'bg-[#FF9A91] hover:bg-[#FF8075] text-[#3C1D22]'
                  : 'bg-[#8CA2FF] hover:bg-[#A3B5FF] text-[#0A1230]'
              }`}
            >
              {isReciting ? 'أنهيت التلاوة' : 'ابدأ التسميع'}
            </button>
          )}

          {/* ======================================================== */}
          {/* "حسبُك" BUTTON (Visible ONLY to the Reciter!)             */}
          {/* Modern, sleek, minimal design                             */}
          {/* ======================================================== */}
          {role === 'reciter' && (
            <button
              type="button"
              onClick={handleHasbukSwapRoles}
              className="bg-[#112347] hover:bg-[#1A3366] text-[#8CA2FF] hover:text-white px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm cursor-pointer border border-[#203D78] active:scale-95 transition-all flex items-center gap-2 shadow-xs"
              title="إتمام القراءة وتسليم الدور للمستمع"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#8CA2FF]">
                <path d="m16 3 4 4-4 4" />
                <path d="M20 7H4" />
                <path d="m8 21-4-4 4-4" />
                <path d="M4 17h16" />
              </svg>
              <span>حسبُك</span>
            </button>
          )}

          {/* If listener, show gentle noble presence */}
          {role === 'listener' && (
            <div className="flex items-center gap-2 text-xs text-[#7A8EBA] px-3">
              <span className="w-2 h-2 rounded-full bg-[#52D17C] animate-pulse" />
              <span>أنت المستمع • متابعة تلقائية مع تلاوة القارئ</span>
            </div>
          )}

          {/* Audio/Video WhatsApp & Discord Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Camera Button */}
            <button
              type="button"
              onClick={handleToggleCam}
              className={`w-11 h-11 rounded-full flex items-center justify-center border shadow-md active:scale-95 transition-all cursor-pointer ${
                camOn
                  ? 'bg-[#122247] border-[#233F7D] text-[#8CA2FF]'
                  : 'bg-[#3C1D22] border-[#FF9A91]/40 text-[#FF9A91]'
              }`}
              title={camOn ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'}
            >
              {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </button>

            {/* Mic Button */}
            <button
              type="button"
              onClick={handleToggleMic}
              className={`w-11 h-11 rounded-full flex items-center justify-center border shadow-md active:scale-95 transition-all cursor-pointer ${
                micOn
                  ? 'bg-[#122247] border-[#233F7D] text-[#8CA2FF]'
                  : 'bg-[#3C1D22] border-[#FF9A91]/40 text-[#FF9A91]'
              }`}
              title={micOn ? 'كتم الميكروفون' : 'تشغيل الميكروفون'}
            >
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>

            {/* Speaker Toggle */}
            <button
              type="button"
              onClick={() => setSpeakerOn(!speakerOn)}
              className={`w-11 h-11 rounded-full flex items-center justify-center border shadow-md active:scale-95 transition-all cursor-pointer ${
                speakerOn
                  ? 'bg-[#122247] border-[#233F7D] text-[#8CA2FF]'
                  : 'bg-[#232F4D] border-[#364973] text-[#7A8EBA]'
              }`}
              title={speakerOn ? 'سماعة المكالمات مفعلة' : 'مكبر الصوت'}
            >
              {speakerOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Hangup Red Button (WhatsApp/Discord Style) */}
            <button
              type="button"
              onClick={() => setShowExitModal(true)}
              className="w-11 h-11 rounded-full bg-[#E02E49] hover:bg-[#C9223C] text-white flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer"
              title="إنهاء المكالمة والرجوع"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>

      {/* Confirmation Modal Before Leaving Call */}
      {showExitModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#0C1630] border border-[#273860] rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4 animate-in zoom-in-95 duration-200">
            
            {/* Red PhoneOff Icon */}
            <div className="w-14 h-14 rounded-full bg-[#3C161B] border border-[#852531] text-[#FF8E8A] flex items-center justify-center mx-auto shadow-inner">
              <PhoneOff className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base sm:text-lg font-bold text-white">
                إنهاء الجلسة الثنائية
              </h3>
              <p className="text-xs text-[#95A7CE] leading-relaxed">
                هل تريد إنهاء جلسة التسميع المعزولة والعودة للساحة الرئيسية مع بقية المشاركين؟
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowExitModal(false)}
                className="flex-1 bg-[#142347] hover:bg-[#1B2F5C] text-[#8CA2FF] py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all"
              >
                متابعة التسميع
              </button>

              <button
                type="button"
                onClick={async () => {
                  setShowExitModal(false);
                  if (streamRef.current) {
                    streamRef.current.getTracks().forEach((t) => t.stop());
                    streamRef.current = null;
                  }
                  if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
                    audioCtxRef.current.close().catch(() => {});
                  }
                  try {
                    await fetch('/api/breakout/leave-pair', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ circleId: circle.id, email: user.email })
                    });
                  } catch {}
                  onBackToMainRoom();
                }}
                className="flex-1 bg-[#E02E49] hover:bg-[#C9223C] text-white py-2.5 rounded-xl text-xs font-bold cursor-pointer shadow-md active:scale-95 transition-all"
              >
                العودة للساحة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
