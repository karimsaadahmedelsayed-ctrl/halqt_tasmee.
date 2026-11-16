import React, { useState, useEffect } from 'react';
import { UserSession, CircleRoom } from './types';
import { GoogleLoginScreen } from './components/GoogleLoginScreen';
import { CreateCircleScreen } from './components/CreateCircleScreen';
//import { GroupChatScreen } from './components/GroupChatScreen';
import { LiveRoomScreen } from './components/LiveRoomScreen';
//import { PairRoomScreen } from './components/PairRoomScreen';
import { ScreenErrorBoundary } from './components/ScreenErrorBoundary';
import { logoutGoogle, checkRedirectResult } from './services/firebaseAuth';

export default function App() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [currentScreen, setCurrentScreen] = useState<'google_login' | 'create_circle' | 'group_chat' | 'live_room' | 'pair_room'>('google_login');
  const [activeCircle, setActiveCircle] = useState<CircleRoom | null>(null);
  const [pairRoomInfo, setPairRoomInfo] = useState<{
    roomNumber: number;
    partnerName: string;
    partnerEmail?: string;
    myRole: 'reciter' | 'listener';
  }>({
    roomNumber: 1,
    partnerName: 'الشريك',
    myRole: 'reciter'
  });
  const [inviteParams, setInviteParams] = useState<{ joinId: string; circleName: string } | null>(null);
  const [isCallInitiator, setIsCallInitiator] = useState<boolean>(true);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [isResolvingGroup, setIsResolvingGroup] = useState<boolean>(false);

  // Helper to join an officially created circle from the server
  const joinOfficialCircle = async (joinId: string, currentUser: UserSession) => {
    try {
      // 1. Verify circle officially exists on server
      const checkRes = await fetch(`/api/circles/${joinId}`);
      const isJson = checkRes.headers.get('content-type')?.includes('application/json');
      if (!checkRes.ok || !isJson) {
        // 404 from our API = the circle really does not exist; anything else = server unreachable
        setInviteError(
          checkRes.status === 404 && isJson
            ? 'رابط الدعوة غير متاح لأن هذه المجموعة لم تُنشأ بعد من قبل المنشئ.'
            : 'تعذر الاتصال بخادم حلقة تسميع للتحقق من الحلقة. حاول مرة أخرى بعد قليل.'
        );
        setCurrentScreen('create_circle');
        return;
      }

      // 2. Officially join circle on server
      const joinRes = await fetch(`/api/circles/${joinId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: currentUser.email,
          name: currentUser.name,
          uid: currentUser.uid,
          picture: currentUser.picture
        })
      });

      const data = await joinRes.json();
      if (data.success && data.circle) {
        setActiveCircle({
          id: data.circle.id,
          name: data.circle.name,
          surahNumber: 2,
          creatorEmail: data.circle.creatorEmail,
          creatorName: data.circle.creatorName,
          members: data.circle.members,
          createdAt: data.circle.createdAt
        });
        setInviteError(null);
        setCurrentScreen('group_chat');
      } else {
        setInviteError('تعذر الانضمام للحلقة.');
        setCurrentScreen('create_circle');
      }
    } catch {
      setInviteError('خطأ في الاتصال بالخادم للتحقق من الحلقة.');
      setCurrentScreen('create_circle');
    }
  };

  // Load user single permanent saved circle from server and set active circle
  const loadUserSavedCircle = async (currentUser: UserSession): Promise<boolean> => {
    try {
      const res = await fetch(`/api/user/circle?email=${encodeURIComponent(currentUser.email)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.circle) {
          const targetCircle = data.circle;
          setActiveCircle({
            id: targetCircle.id,
            name: targetCircle.name,
            surahNumber: 2,
            creatorEmail: targetCircle.creatorEmail,
            creatorName: targetCircle.creatorName,
            members: targetCircle.members,
            createdAt: targetCircle.createdAt
          });
          try {
            localStorage.setItem('t_active_circle_id', targetCircle.id);
          } catch {}
          setCurrentScreen('group_chat');
          return true;
        }
      }
    } catch (err) {
      console.warn('Could not load user circle:', err);
    }
    return false;
  };

  // Parse invite URL search params on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const joinId = params.get('join');
      const circleParam = params.get('circle');
      if (joinId) {
        const decodedName = circleParam ? decodeURIComponent(circleParam) : 'حلقة القرآن الكريم';
        setInviteParams({ joinId, circleName: decodedName });
      }
    } catch {}
  }, []);

  // On opening the site: ALWAYS prompt Google Sign-In as requested!
  useEffect(() => {
    // Clean any stale URL hash
    try {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch {}

    // Every time the user opens the site, present Google Login Screen
    setUser(null);
    setActiveCircle(null);
    setCurrentScreen('google_login');
  }, []);

  const handleLoginSuccess = async (loggedInUser: UserSession) => {
    setUser(loggedInUser);
    setIsResolvingGroup(true);

    // If joining through invite link, verify and enter official group
    if (inviteParams?.joinId) {
      await joinOfficialCircle(inviteParams.joinId, loggedInUser);
      setIsResolvingGroup(false);
      return;
    }

    // Check if the user already has their single permanent group on the server
    const hasCircle = await loadUserSavedCircle(loggedInUser);
    setIsResolvingGroup(false);

    // If account has no group yet, allow creating their single group
    if (!hasCircle) {
      setCurrentScreen('create_circle');
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('t_user_session');
      localStorage.removeItem('t_active_circle_id');
      sessionStorage.clear();
      await logoutGoogle();
    } catch {}
    setUser(null);
    setActiveCircle(null);
    setCurrentScreen('google_login');
  };

  // Step 2 -> Step 3: Enters Group Chat Screen (as in Image 4)
  const handleLaunchCircle = (circle: CircleRoom) => {
    setActiveCircle(circle);
    try {
      localStorage.setItem('t_active_circle_id', circle.id);
    } catch {}
    setCurrentScreen('group_chat');
  };

  // Step 3 -> Step 4: From Group Chat, clicks "انضم للحلقة" to enter the Live Room (Images 1 & 5)
  const handleJoinCallFromGroup = () => {
    setCurrentScreen('live_room');
  };

  // Return from Live Room to Group Chat
  const handleBackToGroup = () => {
    setCurrentScreen('group_chat');
  };

  // Step 4 -> Step 5: From Live Room, enter the isolated Breakout Pair Room
  const handleEnterPairRoom = (info: { roomNumber: number; partnerName: string; myRole: 'reciter' | 'listener'; partnerEmail?: string }) => {
    setPairRoomInfo(info);
    setCurrentScreen('pair_room');
  };

  // Return from Pair Room to Main Lobby (Terminates isolated pair session on server)
  const handleBackToMainRoom = () => {
    if (activeCircle && user) {
      fetch('/api/breakout/leave-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circleId: activeCircle.id, email: user.email })
      }).catch(() => {});
    }
    setCurrentScreen('live_room');
  };

  // Back to circles dashboard from group chat if needed
  const handleBackToCircles = () => {
    setCurrentScreen('create_circle');
  };

  // If user is not authenticated or at login screen, show authentic Google Login Screen
  if (!user || currentScreen === 'google_login') {
    return (
      <div className="min-h-screen bg-[#070D1D] text-[#E7EBF8]">
        <GoogleLoginScreen
          onLoginSuccess={handleLoginSuccess}
          inviteCircleName={inviteParams?.circleName}
          errorMessage={inviteError || undefined}
        />
      </div>
    );
  }

  // Smooth loading splash while fetching user's permanent group
  if (isResolvingGroup) {
    return (
      <div className="min-h-screen bg-[#070D1D] flex flex-col items-center justify-center p-4 text-center font-['IBM_Plex_Sans_Arabic',sans-serif]">
        <div className="w-16 h-16 rounded-2xl bg-[#14244B] border border-[#27325A] flex items-center justify-center text-[#8CA2FF] mb-4 shadow-md animate-pulse">
          <svg viewBox="0 0 100 100" width="38" height="38" fill="currentColor">
            <path fillRule="evenodd" d="M14.6 14.6H85.4V85.4H14.6Z M50 0L100 50L50 100L0 50Z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2 tracking-tight">حلقة تسميع</h2>
        <p className="text-xs text-[#8CA2FF] flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#52D17C] animate-ping" />
          <span>جارٍ فتح حلقتك ومجموعتك الدائمة...</span>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070D1D] text-[#E7EBF8]">
      {/* 2. Create Circle Screen ("أنشئ حلقة" - Only if user has no group yet) */}
      {currentScreen === 'create_circle' && (
        <CreateCircleScreen
          user={user}
          onLogout={handleLogout}
          onLaunchCircle={handleLaunchCircle}
          statusMessage={inviteError || undefined}
        />
      )}

      {/* 3. Group Chat Screen (User's single permanent group) */}
      {currentScreen === 'group_chat' && activeCircle && (
        <GroupChatScreen
          user={user}
          circle={activeCircle}
          onJoinCall={handleJoinCallFromGroup}
          onBackToCircles={handleBackToCircles}
          onLogout={handleLogout}
        />
      )}

      {/* 4. Live Room Screen (Image 1 & 5 - الغرفة المباشرة) */}
      {currentScreen === 'live_room' && activeCircle && (
        <ScreenErrorBoundary fallbackTitle="حدث انقطاع في الساحة الجماعية" onReset={handleBackToGroup}>
          <LiveRoomScreen
            user={user}
            circle={activeCircle}
            isCaller={isCallInitiator}
            onBackToGroup={handleBackToGroup}
            onEnterPairRoom={handleEnterPairRoom}
          />
        </ScreenErrorBoundary>
      )}

      {/* 5. Pair Recitation Room Screen (Image 6, 7, 8, 9 - غرفة التسميع الثنائية) */}
      {currentScreen === 'pair_room' && activeCircle && (
        <ScreenErrorBoundary fallbackTitle="حدث انقطاع في غرفة التسميع المعزولة" onReset={handleBackToMainRoom}>
          <PairRoomScreen
            user={user}
            circle={activeCircle}
            partnerName={pairRoomInfo.partnerName}
            partnerEmail={pairRoomInfo.partnerEmail}
            roomNumber={pairRoomInfo.roomNumber}
            initialRole={pairRoomInfo.myRole}
            onBackToMainRoom={handleBackToMainRoom}
          />
        </ScreenErrorBoundary>
      )}
    </div>
  );
}
