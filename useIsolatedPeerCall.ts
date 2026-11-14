import { useEffect, useRef, useState, useCallback } from 'react';

interface UseIsolatedPeerCallProps {
  channelId: string;
  myEmail: string;
  partnerEmail?: string;
  isInitiator: boolean;
  localStream: MediaStream | null;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export function useIsolatedPeerCall({
  channelId,
  myEmail,
  partnerEmail,
  isInitiator,
  localStream
}: UseIsolatedPeerCallProps) {
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'closed'>('idle');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const hasSentOfferRef = useRef(false);
  const isDisposedRef = useRef(false);

  // Auto-reconnect trigger with exponential backoff
  const triggerReconnect = useCallback(() => {
    if (isDisposedRef.current || !channelId || !myEmail) return;

    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 8000);
    reconnectAttemptsRef.current += 1;

    setConnectionStatus('reconnecting');

    reconnectTimeoutRef.current = setTimeout(() => {
      if (isDisposedRef.current) return;
      try {
        if (pcRef.current) {
          pcRef.current.close();
          pcRef.current = null;
        }
      } catch {}
      hasSentOfferRef.current = false;
      setupPeerConnection();
    }, delay);
  }, [channelId, myEmail, partnerEmail, isInitiator, localStream]);

  // Setup WebRTC peer connection
  const setupPeerConnection = useCallback(() => {
    if (isDisposedRef.current || !channelId || !myEmail) return;

    try {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      // 1. Add local tracks (if available - supports Listen-Only mode when tracks are null)
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          try {
            pc.addTrack(track, localStream);
          } catch {}
        });
      }

      // 2. Receive remote isolated audio/video track
      pc.ontrack = (event) => {
        if (isDisposedRef.current) return;
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          setConnectionStatus('connected');
          reconnectAttemptsRef.current = 0;
        }
      };

      // 3. Monitor connection state & trigger auto-reconnection on network drops
      pc.onconnectionstatechange = () => {
        if (isDisposedRef.current) return;
        const state = pc.connectionState;
        if (state === 'connected') {
          setConnectionStatus('connected');
          reconnectAttemptsRef.current = 0;
        } else if (state === 'disconnected') {
          setConnectionStatus('reconnecting');
          triggerReconnect();
        } else if (state === 'failed') {
          setConnectionStatus('reconnecting');
          triggerReconnect();
        } else if (state === 'closed') {
          setConnectionStatus('closed');
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (isDisposedRef.current) return;
        const iceState = pc.iceConnectionState;
        if (iceState === 'connected' || iceState === 'completed') {
          setConnectionStatus('connected');
          reconnectAttemptsRef.current = 0;
        } else if (iceState === 'disconnected' || iceState === 'failed') {
          setConnectionStatus('reconnecting');
          triggerReconnect();
        }
      };

      // 4. Send ICE candidate to partner over isolated channelId
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          fetch('/api/live-call/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channelId,
              from: myEmail,
              to: partnerEmail || 'broadcast',
              signal: { candidate: event.candidate }
            })
          }).catch(() => {});
        }
      };

      // 5. Offer creation
      const initiateOffer = async () => {
        if (!pc || hasSentOfferRef.current || isDisposedRef.current) return;
        hasSentOfferRef.current = true;
        try {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          await pc.setLocalDescription(offer);

          await fetch('/api/live-call/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channelId,
              from: myEmail,
              to: partnerEmail || 'broadcast',
              signal: { sdp: pc.localDescription }
            })
          });
        } catch (err) {
          console.warn('Isolated offer notice:', err);
        }
      };

      if (isInitiator) {
        setTimeout(() => {
          if (!isDisposedRef.current) initiateOffer();
        }, 400);
      }

      setConnectionStatus('connecting');
    } catch (e) {
      console.warn('RTCPeerConnection init notice:', e);
      setConnectionStatus('reconnecting');
      triggerReconnect();
    }
  }, [channelId, myEmail, partnerEmail, isInitiator, localStream, triggerReconnect]);

  useEffect(() => {
    isDisposedRef.current = false;
    hasSentOfferRef.current = false;

    // Handle online/offline network events
    const handleOnline = () => {
      setIsOnline(true);
      setConnectionStatus('reconnecting');
      triggerReconnect();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setConnectionStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setupPeerConnection();

    // Signal polling loop with safety try/catch and error resistance
    const pollSignals = async () => {
      if (isDisposedRef.current || !pcRef.current) return;
      try {
        const res = await fetch(`/api/live-call/signals/${encodeURIComponent(channelId)}/${encodeURIComponent(myEmail)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.signals && Array.isArray(data.signals)) {
          for (const item of data.signals) {
            const { signal } = item;
            if (!signal) continue;

            const pc = pcRef.current;
            if (!pc) return;

            if (signal.sdp) {
              if (signal.sdp.type === 'offer' && !isInitiator) {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                await fetch('/api/live-call/signal', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    channelId,
                    from: myEmail,
                    to: item.from || 'broadcast',
                    signal: { sdp: pc.localDescription }
                  })
                });
              } else if (signal.sdp.type === 'answer' && isInitiator) {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                setConnectionStatus('connected');
                reconnectAttemptsRef.current = 0;
              }
            } else if (signal.candidate) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
              } catch {}
            }
          }
        }
      } catch (pollErr) {
        // Network drop during poll
        if (!navigator.onLine) {
          setIsOnline(false);
          setConnectionStatus('offline');
        }
      }
    };

    pollIntervalRef.current = setInterval(pollSignals, 1500);

    return () => {
      isDisposedRef.current = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

      if (pcRef.current) {
        try {
          pcRef.current.ontrack = null;
          pcRef.current.onicecandidate = null;
          pcRef.current.close();
        } catch {}
        pcRef.current = null;
      }
      setRemoteStream(null);
      setConnectionStatus('closed');
    };
  }, [channelId, myEmail, partnerEmail, isInitiator, localStream, setupPeerConnection, triggerReconnect]);

  return {
    connectionStatus,
    remoteStream,
    isOnline,
    triggerReconnect
  };
}
