import React, { useState, useEffect, useRef } from 'react';
import { UserSession, CircleRoom, ChatMessage, PeerParticipant } from '../types';
import { toArabicNumerals, getSurahWords, QuranWordUnit, TasmeeMatcher, WordMatchState } from '../utils/tasmeeEngine';
import { SAMPLE_QURAN_VERSES, SURAH_NAMES } from '../utils/quranData';

interface RoomScreenProps {
  user: UserSession;
  circle: CircleRoom;
  onLeave: () => void;
}

export const RoomScreen: React.FC<RoomScreenProps> = ({ user, circle, onLeave }) => {
  // Media State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [hasVideo, setHasVideo] = useState(false);
  const [isSpeakingMe, setIsSpeakingMe] = useState(false);

  // Split / Topology
  const [isSplit, setIsSplit] = useState(false);
  const [myRole, setMyRole] = useState<'reciter' | 'listener'>('reciter');
  const [bannerText, setBannerText] = useState<string | null>(null);

  // Recitation & Mushaf State
  const [words, setWords] = useState<QuranWordUnit[]>([]);
  const [matcher, setMatcher] = useState<TasmeeMatcher | null>(null);
  const [wordStates, setWordStates] = useState<WordMatchState[]>([]);
  const [currentWordIdx, setCurrentWordIdx] = useState<number>(-1);
  const [isReciting, setIsReciting] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [delaySec, setDelaySec] = useState(0);
  const [isReviewDone, setIsReviewDone] = useState(false);
  const [showMicReminder, setShowMicReminder] = useState(false);

  // Chat State
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      uid: 'u_shk',
      name: 'الشيخ عبد الله',
      text: 'السلام عليكم ورحمة الله وبركاته، أهلاً بكم في حلقة مراجعة كتاب الله.',
      t: Date.now() - 1000 * 60 * 3
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isExcuse, setIsExcuse] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Simulated peer companion (الشيخ عبد الله)
  const [peer, setPeer] = useState<PeerParticipant>({
    id: 'p_peer_shk',
    name: 'الشيخ عبد الله (مستمع)',
    uid: 'u_shk',
    isMuted: false,
    isSpeaking: false,
    hasVideo: false,
    lastRecitedText: 'سورة الكهف · الجزء ١٥'
  });

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const mushafContainerRef = useRef<HTMLDivElement | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Load Quran Words for the selected Surah
  useEffect(() => {
    const units = getSurahWords(circle.surahNumber || 1);
    setWords(units);
    const m = new TasmeeMatcher(units.map(u => u.word));
    setMatcher(m);
    setWordStates(new Array(units.length).fill(null));
  }, [circle.surahNumber]);

  // Request User Media (Camera & Mic)
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function initMedia() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        setHasVideo(true);
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setupAudioAnalyser(stream);
      } catch (err) {
        // Fallback to audio only
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (cancelled) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }
          setHasVideo(false);
          setLocalStream(stream);
          setupAudioAnalyser(stream);
        } catch {
          // If media blocked by environment, proceed gracefully
          setHasVideo(false);
        }
      }
    }

    initMedia();

    return () => {
      cancelled = true;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {}
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  // Audio level monitoring for voice activity detection
  const setupAudioAnalyser = (stream: MediaStream) => {
    if (!stream.getAudioTracks().length) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      const interval = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let max = 0;
        for (let i = 0; i < data.length; i++) {
          const val = Math.abs(data[i] - 128);
          if (val > max) max = val;
        }
        setIsSpeakingMe(max > 12);
      }, 150);

      return () => clearInterval(interval);
    } catch {}
  };

  // Toggle Microphone
  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    if (localStream) {
      localStream.getAudioTracks().forEach(t => {
        t.enabled = next;
      });
    }
  };

  // Toggle Camera
  const toggleCam = () => {
    if (!hasVideo) return;
    const next = !camOn;
    setCamOn(next);
    if (localStream) {
      localStream.getVideoTracks().forEach(t => {
        t.enabled = next;
      });
    }
  };

  // Split room toggle
  const toggleSplit = () => {
    if (!isSplit) {
      setIsSplit(true);
      setMyRole('reciter');
      setBannerText(`أنت في غرفة ١ مع ${peer.name} — دورك: تقرأ.`);
    } else {
      setIsSplit(false);
      setBannerText('عُدتم إلى الغرفة الرئيسية.');
      setTimeout(() => setBannerText(null), 5000);
    }
  };

  // Speech Recognition / Tasmee' Recitation Flow
  const startRecitation = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsReciting(true);
    setIsReviewDone(false);

    if (SR) {
      try {
        const rec = new SR();
        rec.lang = 'ar-SA';
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = 1;

        rec.onresult = (e: any) => {
          let interim = '';
          let finalTranscript = '';

          for (let i = e.resultIndex; i < e.results.length; i++) {
            const transcript = e.results[i][0].transcript;
            if (e.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interim += transcript;
            }
          }

          const currentWords = (finalTranscript || interim).trim().split(/\s+/).filter(Boolean);
          if (currentWords.length) {
            setRecognizedText(currentWords.join(' '));
            processSpokenWords(currentWords, !!finalTranscript);
          }
        };

        rec.onerror = () => {};
        rec.onend = () => {
          if (isReciting) {
            try { rec.start(); } catch {}
          }
        };

        rec.start();
        speechRecognitionRef.current = rec;
      } catch {
        // Fallback
      }
    }
  };

  const finishRecitation = () => {
    setIsReciting(false);
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch {}
    }
    if (matcher) {
      matcher.finalize();
      setWordStates([...matcher.st]);
    }
    setIsReviewDone(true);
  };

  // Process Spoken Words through Tasmee' Matcher
  const processSpokenWords = (spokenWords: string[], isFinal: boolean) => {
    if (!matcher) return;
    if (isFinal) {
      matcher.feed(spokenWords);
      setWordStates([...matcher.st]);
      setCurrentWordIdx(matcher.cursor() - 1);
    } else {
      const preview = matcher.preview(spokenWords);
      setWordStates(preview.st);
      setCurrentWordIdx(preview.cursor - 1);
    }

    // Auto-scroll Mushaf to current word
    if (mushafContainerRef.current) {
      const curElem = mushafContainerRef.current.querySelector('.w.cur');
      if (curElem) {
        curElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  };

  // Helper Simulator for testing without mic or in headless browser
  const simulateReadStep = (verseIdx: number) => {
    const surahData = SAMPLE_QURAN_VERSES[circle.surahNumber || 1] || SAMPLE_QURAN_VERSES[1];
    if (verseIdx < surahData.ayahs.length) {
      const ayah = surahData.ayahs[verseIdx];
      const ayahWords = ayah.text.split(' ').filter(Boolean);
      processSpokenWords(ayahWords, true);
      setRecognizedText(ayah.text);
    }
  };

  // Send Chat Message
  const handleSendChat = () => {
    const text = chatInput.trim();
    if (!text) return;

    const newMsg: ChatMessage = {
      id: 'm_' + Date.now(),
      uid: user.uid,
      name: user.name,
      text,
      t: Date.now(),
      excuse: isExcuse
    };

    setMessages([...messages, newMsg]);
    setChatInput('');
    setIsExcuse(false);

    // Optional automated simulated reply from companion
    setTimeout(() => {
      if (text.includes('السلام') || text.includes('أبدأ') || text.includes('جاهز')) {
        setMessages(prev => [
          ...prev,
          {
            id: 'm_reply_' + Date.now(),
            uid: 'u_shk',
            name: 'الشيخ عبد الله',
            text: 'تفضل بالقراءة على بركة الله، وأنا مستمع إليك ومتابع معك.',
            t: Date.now()
          }
        ]);
        if (!chatOpen) setUnreadCount(c => c + 1);
      }
    }, 1200);
  };

  const remainingMessagesToday = Math.max(0, 3 - messages.filter(m => m.uid === user.uid && !m.excuse).length);
  const surahName = SURAH_NAMES[(circle.surahNumber || 1) - 1] || 'الفاتحة';
  const stats = matcher ? matcher.getStats() : { ok: 0, near: 0, err: 0, miss: 0 };

  return (
    <div className="min-h-screen bg-[#EDF0F7] dark:bg-[#0A1024] text-[#111B38] dark:text-[#E7EBF8] flex flex-col font-['IBM_Plex_Sans_Arabic',sans-serif]">
      
      {/* Top Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-white dark:bg-[#121A33] border-b border-[#CBD3E6] dark:border-[#27325A] gap-2">
        <div className="flex items-center gap-3">
          <b className="text-base text-[#27409E] dark:text-[#8CA2FF]">{circle.name}</b>
          <span className="text-xs text-[#4B5878] dark:text-[#9AA7C9]">
            {toArabicNumerals(1)} متواجد في الغرفة
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSplit}
            className="border border-[#CBD3E6] dark:border-[#27325A] bg-[#E3E8F3] dark:bg-[#1A2444] rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer active:scale-95 transition-transform hover:bg-[#DCE3F8] dark:hover:bg-[#1D2A5C]"
          >
            {isSplit ? 'أعد إلى الغرفة الرئيسية' : 'قسّم الغرفة ثنائياً'}
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="border border-[#B3261E]/30 bg-[#FBE3E0] dark:bg-[#3C1D22] text-[#B3261E] dark:text-[#FF9A91] rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
          >
            خروج
          </button>
        </div>
      </div>

      {/* Split/System Banner */}
      {bannerText && (
        <div className="bg-[#F8EBCB] dark:bg-[#3A2F12] text-[#7A4F08] dark:text-[#F2C14E] border border-[#C58A1B] rounded-xl p-3 mx-2.5 my-2 text-xs font-medium animate-in fade-in">
          <b>تم التوزيع: </b>
          <span>{bannerText}</span>
        </div>
      )}

      {/* Main Grid: Video/Audio Tiles */}
      <div className="p-2.5 grid gap-2.5 grid-cols-1 sm:grid-cols-2 flex-1 max-h-[38vh] min-h-[170px]">
        {/* Local Participant Tile */}
        <div
          className={`relative bg-[#E3E8F3] dark:bg-[#1A2444] rounded-2xl overflow-hidden border-2 transition-all min-h-[160px] flex items-center justify-center ${
            isSpeakingMe && micOn ? 'border-[#1B7A3E] speaking-border' : 'border-transparent'
          }`}
        >
          {hasVideo && camOn ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-4xl font-bold text-[#27409E] dark:text-[#8CA2FF] bg-[#DCE3F8] dark:bg-[#1D2A5C]">
              {user.name.charAt(0)}
            </div>
          )}

          <span className="absolute bottom-2 right-2 bg-black/60 text-white rounded-full px-2.5 py-0.5 text-xs">
            {user.name} (أنت)
          </span>

          {!micOn && (
            <span className="absolute top-2 left-2 bg-[#B3261E] text-white rounded-full px-2 py-0.5 text-[11px]">
              مكتوم
            </span>
          )}
        </div>

        {/* Remote Companion Participant Tile */}
        <div
          className={`relative bg-[#E3E8F3] dark:bg-[#1A2444] rounded-2xl overflow-hidden border-2 transition-all min-h-[160px] flex items-center justify-center ${
            peer.isSpeaking ? 'border-[#1B7A3E] speaking-border' : 'border-transparent'
          }`}
        >
          <div className="absolute inset-0 flex items-center justify-center text-4xl font-bold text-[#C58A1B] dark:text-[#F2C14E] bg-[#F8EBCB] dark:bg-[#3A2F12]">
            ع
          </div>

          <span className="absolute bottom-2 right-2 bg-black/60 text-white rounded-full px-2.5 py-0.5 text-xs">
            {peer.name} · آخر ما سمّع: {peer.lastRecitedText}
          </span>
        </div>
      </div>

      {/* The Recitation Pair / Interactive Tasmee' Section */}
      <div className="px-2.5 pb-2 flex flex-col gap-2">
        {/* Role Switcher tabs for easy testing of both Reciter and Listener modes */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMyRole('reciter')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              myRole === 'reciter'
                ? 'bg-[#27409E] text-white'
                : 'bg-white dark:bg-[#121A33] border border-[#CBD3E6] dark:border-[#27325A]'
            }`}
          >
            أنت القارئ
          </button>
          <button
            type="button"
            onClick={() => setMyRole('listener')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              myRole === 'listener'
                ? 'bg-[#27409E] text-white'
                : 'bg-white dark:bg-[#121A33] border border-[#CBD3E6] dark:border-[#27325A]'
            }`}
          >
            أنت المستمع
          </button>
        </div>

        {/* RECITER MODE */}
        {myRole === 'reciter' && (
          <div className="bg-white dark:bg-[#121A33] border border-[#CBD3E6] dark:border-[#27325A] rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <b className="text-sm text-[#27409E] dark:text-[#8CA2FF]">أنت القارئ</b>
              <span className="text-xs bg-[#DCE3F8] dark:bg-[#1D2A5C] text-[#27409E] dark:text-[#8CA2FF] px-2.5 py-0.5 rounded-full font-medium">
                سورة {surahName}
              </span>
            </div>

            <p className="text-xs text-[#4B5878] dark:text-[#9AA7C9]">
              اضغط «ابدأ» ثم اقرأ من المصحف. يتعرف جهازك على كلامك ويُظهر المطابقة لزميلك المستمع فقط.
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={isReciting ? finishRecitation : startRecitation}
                className={`py-2 px-5 rounded-xl font-bold text-sm cursor-pointer transition-colors ${
                  isReciting
                    ? 'bg-[#B3261E] hover:bg-[#921E17] text-white'
                    : 'bg-[#27409E] hover:bg-[#1F3480] text-white'
                }`}
              >
                {isReciting ? 'أنهيت التلاوة' : 'ابدأ التسميع'}
              </button>

              {/* Fast test simulators for browser / environment verification */}
              <button
                type="button"
                onClick={() => simulateReadStep(0)}
                className="text-[11px] border border-[#CBD3E6] dark:border-[#27325A] bg-[#EDF0F7] dark:bg-[#1A2444] px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-[#DCE3F8]"
              >
                محاكاة قراءة: الآية الأولى
              </button>
              <button
                type="button"
                onClick={() => simulateReadStep(1)}
                className="text-[11px] border border-[#CBD3E6] dark:border-[#27325A] bg-[#EDF0F7] dark:bg-[#1A2444] px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-[#DCE3F8]"
              >
                الآية الثانية
              </button>
            </div>

            {recognizedText && (
              <div className="text-xs text-[#4B5878] dark:text-[#9AA7C9] bg-[#EDF0F7]/60 dark:bg-[#1A2444]/60 p-2 rounded-lg">
                <span className="font-semibold ml-1">الكلام المتعرف عليه:</span>
                <span className="text-[#1B7A3E] dark:text-[#6FD39A]">{recognizedText}</span>
              </div>
            )}
          </div>
        )}

        {/* LISTENER MODE */}
        {myRole === 'listener' && (
          <div className="bg-white dark:bg-[#121A33] border border-[#CBD3E6] dark:border-[#27325A] rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <b className="text-sm text-[#27409E] dark:text-[#8CA2FF]">أنت المستمع</b>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#4B5878] dark:text-[#9AA7C9]">إظهار التصحيح:</span>
                <select
                  value={delaySec}
                  onChange={(e) => setDelaySec(Number(e.target.value))}
                  className="border border-[#CBD3E6] dark:border-[#27325A] bg-[#EDF0F7] dark:bg-[#1A2444] rounded-lg px-2 py-1 text-xs"
                >
                  <option value={0}>مباشر</option>
                  <option value={120}>بعد دقيقتين</option>
                  <option value={240}>بعد ٤ دقائق</option>
                </select>
              </div>
            </div>

            {/* Silent mic reminder */}
            {micOn && (
              <div className="bg-[#F8EBCB] dark:bg-[#3A2F12] text-[#7A4F08] dark:text-[#F2C14E] border border-[#C58A1B] rounded-xl p-2.5 text-xs flex items-center justify-between gap-2">
                <span>
                  <b>المايك مفتوح وأنت صامت.</b> أغلقه أثناء الاستماع حتى لا يتشوش صوت القارئ.
                </span>
                <button
                  type="button"
                  onClick={toggleMic}
                  className="bg-[#C58A1B] text-white text-[11px] px-2.5 py-1 rounded-lg shrink-0 cursor-pointer font-semibold"
                >
                  أغلق المايك
                </button>
              </div>
            )}

            {/* Surah / Ayah / Juz chips */}
            <div className="flex gap-2 flex-wrap text-xs">
              <span className="bg-[#DCE3F8] dark:bg-[#1D2A5C] text-[#27409E] dark:text-[#8CA2FF] px-2.5 py-0.5 rounded-full font-medium">
                سورة {surahName}
              </span>
              <span className="bg-[#DCE3F8] dark:bg-[#1D2A5C] text-[#27409E] dark:text-[#8CA2FF] px-2.5 py-0.5 rounded-full font-medium">
                الآية {toArabicNumerals(currentWordIdx >= 0 && words[currentWordIdx] ? words[currentWordIdx].ayahNumber : 1)}
              </span>
              <span className="bg-[#DCE3F8] dark:bg-[#1D2A5C] text-[#27409E] dark:text-[#8CA2FF] px-2.5 py-0.5 rounded-full font-medium">
                الجزء {toArabicNumerals(1)}
              </span>
              {delaySec > 0 && (
                <span className="bg-[#F8EBCB] text-[#7A4F08] px-2.5 py-0.5 rounded-full font-medium">
                  التصحيح مؤجّل
                </span>
              )}
            </div>

            {/* Interactive Mushaf Text Box */}
            <div
              ref={mushafContainerRef}
              className="bg-[#FBF8EF] dark:bg-[#161F3D] text-[#1A1A2E] dark:text-[#EDEFF9] rounded-xl p-4 font-['Amiri_Quran',serif] text-2xl leading-[2.4] text-justify max-h-[35vh] overflow-y-auto border border-[#CBD3E6]/60 dark:border-[#27325A]/60 shadow-inner"
            >
              {words.map((unit, idx) => {
                const st = wordStates[idx];
                const isCur = idx === currentWordIdx;
                let stateClass = 'opacity-50'; // pending

                if (st === 'ok') {
                  stateClass = 'opacity-100 text-[#1B7A3E] dark:text-[#6FD39A] font-medium';
                } else if (st === 'near') {
                  stateClass = 'opacity-100 text-[#C58A1B] dark:text-[#F2C14E] underline decoration-dotted underline-offset-4';
                } else if (st === 'err') {
                  stateClass = 'opacity-100 bg-[#FBE3E0] dark:bg-[#3C1D22] text-[#B3261E] dark:text-[#FF9A91] underline decoration-wavy underline-offset-4';
                } else if (st === 'miss') {
                  stateClass = 'opacity-100 border-b-2 border-dashed border-[#B3261E] text-[#B3261E]';
                }

                if (isCur) {
                  stateClass += ' bg-[#F8EBCB] dark:bg-[#3A2F12] rounded-md px-1';
                }

                return (
                  <React.Fragment key={idx}>
                    <span className={`inline-block px-0.5 transition-colors ${stateClass}`}>
                      {unit.word}
                    </span>
                    {unit.isLastWordOfAyah && (
                      <span className="text-[#C58A1B] dark:text-[#F2C14E] text-lg mx-1.5 font-bold">
                        ﴿{toArabicNumerals(unit.ayahNumber)}﴾
                      </span>
                    )}
                    {' '}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Review and Corrections Report */}
            {isReviewDone && (
              <div className="bg-[#EDF0F7] dark:bg-[#1A2444] rounded-xl p-3 text-xs space-y-1.5 border border-[#CBD3E6] dark:border-[#27325A]">
                <b className="text-[#27409E] dark:text-[#8CA2FF] block text-sm">تقرير التسميع للتصحيح:</b>
                <p className="text-[#1B7A3E] dark:text-[#6FD39A]">
                  ✓ {toArabicNumerals(stats.ok)} كلمة صحيحة
                </p>
                {stats.err > 0 && (
                  <p className="text-[#B3261E] dark:text-[#FF9A91]">
                    ✗ {toArabicNumerals(stats.err)} كلمة مبدلة أو غير مطابقة
                  </p>
                )}
                {stats.miss > 0 && (
                  <p className="text-[#B3261E] dark:text-[#FF9A91]">
                    ✗ {toArabicNumerals(stats.miss)} كلمة ناقصة
                  </p>
                )}
                {stats.near > 0 && (
                  <p className="text-[#C58A1B] dark:text-[#F2C14E]">
                    ⚠ {toArabicNumerals(stats.near)} كلمة غير مؤكدة (قد يكون السبب وضوح الصوت)
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="flex gap-2.5 justify-center p-3 bg-white dark:bg-[#121A33] border-t border-[#CBD3E6] dark:border-[#27325A] flex-wrap mt-auto">
        <button
          type="button"
          onClick={toggleMic}
          className={`min-w-[80px] py-2.5 px-4 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
            micOn
              ? 'bg-[#E3E8F3] dark:bg-[#1A2444] border-[#CBD3E6] dark:border-[#27325A] text-[#111B38] dark:text-[#E7EBF8]'
              : 'bg-[#FBE3E0] dark:bg-[#3C1D22] border-[#B3261E] text-[#B3261E] dark:text-[#FF9A91]'
          }`}
        >
          {micOn ? 'المايك يعمل' : 'المايك مكتوم'}
        </button>

        <button
          type="button"
          disabled={!hasVideo}
          onClick={toggleCam}
          className={`min-w-[80px] py-2.5 px-4 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
            !hasVideo
              ? 'opacity-50 cursor-not-allowed bg-gray-200 dark:bg-gray-800'
              : camOn
              ? 'bg-[#E3E8F3] dark:bg-[#1A2444] border-[#CBD3E6] dark:border-[#27325A] text-[#111B38] dark:text-[#E7EBF8]'
              : 'bg-[#FBE3E0] dark:bg-[#3C1D22] border-[#B3261E] text-[#B3261E] dark:text-[#FF9A91]'
          }`}
        >
          {!hasVideo ? 'لا كاميرا' : camOn ? 'الكاميرا تعمل' : 'الكاميرا مغلقة'}
        </button>

        <button
          type="button"
          onClick={() => {
            setChatOpen(!chatOpen);
            setUnreadCount(0);
          }}
          className="min-w-[80px] py-2.5 px-4 rounded-xl text-xs font-semibold border border-[#CBD3E6] dark:border-[#27325A] bg-[#E3E8F3] dark:bg-[#1A2444] text-[#111B38] dark:text-[#E7EBF8] cursor-pointer hover:bg-[#DCE3F8] dark:hover:bg-[#1D2A5C] transition-colors"
        >
          الرسائل {unreadCount > 0 && `(${toArabicNumerals(unreadCount)})`}
        </button>
      </div>

      {/* Chat Drawer / Panel */}
      {chatOpen && (
        <div className="bg-white dark:bg-[#121A33] border-t border-[#CBD3E6] dark:border-[#27325A] flex flex-col h-[40vh] max-h-[300px]">
          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  m.uid === user.uid
                    ? 'bg-[#DCE3F8] dark:bg-[#1D2A5C] text-[#111B38] dark:text-[#E7EBF8] self-end'
                    : 'bg-[#E3E8F3] dark:bg-[#1A2444] text-[#111B38] dark:text-[#E7EBF8] self-start'
                } ${m.excuse ? 'border border-dashed border-[#C58A1B] bg-[#F8EBCB] text-[#7A4F08]' : ''}`}
              >
                <b className="text-[10px] text-[#4B5878] dark:text-[#9AA7C9] block mb-0.5">
                  {m.name} {m.excuse && '· عذر'} · {new Date(m.t).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                </b>
                <div>{m.text}</div>
              </div>
            ))}
          </div>

          {/* Form */}
          <div className="flex gap-2 p-2.5 border-t border-[#CBD3E6]/60 dark:border-[#27325A]/60 items-center bg-[#EDF0F7]/40 dark:bg-[#1A2444]/40">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
              placeholder="اكتب رسالة..."
              maxLength={500}
              className="flex-1 bg-white dark:bg-[#121A33] border border-[#CBD3E6] dark:border-[#27325A] rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#27409E]"
            />
            <label className="text-xs text-[#4B5878] dark:text-[#9AA7C9] flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isExcuse}
                onChange={(e) => setIsExcuse(e.target.checked)}
                className="w-3.5 h-3.5 rounded"
              />
              <span>عذر</span>
            </label>
            <button
              type="button"
              onClick={handleSendChat}
              className="bg-[#27409E] hover:bg-[#1F3480] text-white rounded-xl px-4 py-2 text-xs font-bold cursor-pointer"
            >
              إرسال
            </button>
          </div>

          <p className="text-[11px] text-[#4B5878] dark:text-[#9AA7C9] px-3 py-1 bg-white dark:bg-[#121A33]">
            المتبقي لك اليوم: {toArabicNumerals(remainingMessagesToday)} من ٣ رسائل. الأعذار لا تُحتسب.
          </p>
        </div>
      )}
    </div>
  );
};
