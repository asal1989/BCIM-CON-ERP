// src/hooks/useWebRTC.js — WebRTC peer-connection lifecycle for 1-to-1 calls.
// The server acts as a pure signaling relay (call:offer / call:answer /
// call:ice-candidate) via Socket.io user-rooms; no media ever hits the server.
import { useRef, useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';

const CALL_TIMEOUT_MS = 60_000; // auto-end outgoing call if no answer within 60 s

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export const CALL_STATE = {
  IDLE:     'idle',
  CALLING:  'calling',
  INCOMING: 'incoming',
  ACTIVE:   'active',
};

// Save a call log entry to the backend (fire-and-forget — don't block UI)
function saveCallLog(payload) {
  api.post('/chat/call-logs', payload).catch(() => {});
}

export function useWebRTC({ socketRef, connected, currentUser }) {
  const [callState,       setCallState]       = useState(CALL_STATE.IDLE);
  const [callInfo,        setCallInfo]        = useState(null);
  const [localStream,     setLocalStream]     = useState(null);
  const [remoteStream,    setRemoteStream]    = useState(null);
  const [isMuted,         setIsMuted]         = useState(false);
  const [isCameraOff,     setIsCameraOff]     = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [duration,        setDuration]        = useState(0);

  const pcRef             = useRef(null);
  const localStreamRef    = useRef(null);
  const screenTrackRef    = useRef(null);
  const durationTimerRef  = useRef(null);
  const callTimeoutRef    = useRef(null);
  const pendingCandidates = useRef([]);
  const callStateRef      = useRef(CALL_STATE.IDLE);
  const callInfoRef       = useRef(null);
  const iceServersRef     = useRef(STUN_SERVERS);
  const callStartTimeRef  = useRef(null);  // when call went ACTIVE
  const callInitTimeRef   = useRef(null);  // when startCall / incoming arrived
  const isCallerRef       = useRef(false); // true when we initiated the call

  useEffect(() => {
    api.get('/chat/turn-credentials').then(r => {
      if (r.data?.iceServers?.length) iceServersRef.current = r.data.iceServers;
    }).catch(() => {});
  }, []);

  useEffect(() => { localStreamRef.current = localStream;  }, [localStream]);
  useEffect(() => { callStateRef.current   = callState;    }, [callState]);
  useEffect(() => { callInfoRef.current    = callInfo;     }, [callInfo]);

  // ── Cleanup + call logging ───────────────────────────────────────────────────
  // `logStatus` tells us how the call ended from our perspective:
  //   'answered'  — call was active and we (or peer) hung up
  //   'cancelled' — we called, never got an answer
  //   'missed'    — we received but never accepted
  //   'rejected'  — we explicitly rejected incoming call
  //   'busy'      — peer was busy (no log needed from our side)
  const cleanup = useCallback((logStatus = null) => {
    clearInterval(durationTimerRef.current);
    clearTimeout(callTimeoutRef.current);

    const info      = callInfoRef.current;
    const state     = callStateRef.current;
    const isCaller  = isCallerRef.current;
    const started   = callInitTimeRef.current;
    const activated = callStartTimeRef.current;

    // Log the call if there was a real interaction (not just noise)
    if (info && logStatus && logStatus !== 'busy' && started) {
      const durSecs = activated
        ? Math.round((Date.now() - activated) / 1000)
        : 0;
      // Always log from the caller's perspective; callee-side logs incoming calls too
      saveCallLog({
        callee_id:     isCaller ? info.peerId      : currentUser?.id,
        callee_name:   isCaller ? info.peerName    : (currentUser?.full_name || currentUser?.name || 'Me'),
        // swap so backend knows who actually called whom
        // The API saves req.user as caller automatically, so if we're the callee
        // we fake it by sending our own id as callee (server uses req.user as caller)
        // — just log from whichever side has the info, server stores caller = req.user
        call_type:     info.callType  || 'audio',
        status:        logStatus,
        duration_secs: durSecs,
        started_at:    new Date(started).toISOString(),
      });
    }

    // Reset call tracking refs
    callStartTimeRef.current = null;
    callInitTimeRef.current  = null;
    isCallerRef.current      = false;

    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setCallState(CALL_STATE.IDLE);
    setCallInfo(null);
    setIsMuted(false);
    setIsCameraOff(false);
    setIsScreenSharing(false);
    setDuration(0);
    pendingCandidates.current = [];
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Create RTCPeerConnection ─────────────────────────────────────────────────
  const createPC = useCallback((peerId) => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit('call:ice-candidate', { to: peerId, candidate: e.candidate });
    };
    pc.ontrack = (e) => setRemoteStream(e.streams[0] || null);
    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        // Connection dropped unexpectedly — log as answered (we were active)
        cleanup(callStateRef.current === CALL_STATE.ACTIVE ? 'answered' : null);
      }
    };
    pcRef.current = pc;
    return pc;
  }, [socketRef, cleanup]);

  // ── Get user media ───────────────────────────────────────────────────────────
  const getUserMedia = useCallback(async (callType = 'video') => {
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video'
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        : false,
    });
  }, []);

  // ── Start outgoing call ──────────────────────────────────────────────────────
  const startCall = useCallback(async (peer, callType = 'video') => {
    if (callStateRef.current !== CALL_STATE.IDLE) return;
    const stream = await getUserMedia(callType);
    setLocalStream(stream);
    localStreamRef.current = stream;

    const pc = createPC(peer.id);
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    callInitTimeRef.current = Date.now();
    isCallerRef.current     = true;

    setCallState(CALL_STATE.CALLING);
    setCallInfo({ peerId: peer.id, peerName: peer.full_name || peer.name || 'User', peerPhoto: peer.profile_photo_url, callType });

    socketRef.current?.emit('call:offer', {
      to: peer.id, offer,
      callerName:  currentUser?.full_name || currentUser?.name,
      callerPhoto: currentUser?.profile_photo_url,
      callType,
    });

    callTimeoutRef.current = setTimeout(() => {
      if (callStateRef.current === CALL_STATE.CALLING) {
        toast.error('No answer — call ended');
        const info = callInfoRef.current;
        if (info?.peerId) socketRef.current?.emit('call:end', { to: info.peerId });
        cleanup('cancelled');
      }
    }, CALL_TIMEOUT_MS);
  }, [getUserMedia, createPC, socketRef, currentUser, cleanup]);

  // ── Accept incoming call ─────────────────────────────────────────────────────
  const answerCall = useCallback(async () => {
    const info = callInfoRef.current;
    if (callStateRef.current !== CALL_STATE.INCOMING || !info) return;

    const stream = await getUserMedia(info.callType);
    setLocalStream(stream);
    localStreamRef.current = stream;

    const pc = createPC(info.peerId);
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    await pc.setRemoteDescription(new RTCSessionDescription(info.offer));
    for (const c of pendingCandidates.current) {
      await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
    pendingCandidates.current = [];

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketRef.current?.emit('call:answer', { to: info.peerId, answer });

    callStartTimeRef.current = Date.now();
    setCallState(CALL_STATE.ACTIVE);
    durationTimerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  }, [getUserMedia, createPC, socketRef]);

  // ── End / reject calls ───────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    const info  = callInfoRef.current;
    const state = callStateRef.current;
    if (info?.peerId) socketRef.current?.emit('call:end', { to: info.peerId });
    cleanup(state === CALL_STATE.ACTIVE ? 'answered' : 'cancelled');
  }, [socketRef, cleanup]);

  const rejectCall = useCallback(() => {
    const info = callInfoRef.current;
    if (info?.peerId) socketRef.current?.emit('call:reject', { to: info.peerId });
    cleanup('rejected');
  }, [socketRef, cleanup]);

  // ── Media controls ───────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(m => !m);
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsCameraOff(v => !v);
  }, []);

  const startScreenShare = useCallback(async () => {
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track  = screen.getVideoTracks()[0];
      screenTrackRef.current = track;
      const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(track);
      setIsScreenSharing(true);
      track.onended = () => stopScreenShareInternal();
    } catch { /* user cancelled */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopScreenShareInternal = useCallback(async () => {
    if (screenTrackRef.current) { screenTrackRef.current.stop(); screenTrackRef.current = null; }
    const stream = localStreamRef.current;
    if (!stream) return;
    const camTrack = stream.getVideoTracks()[0];
    const sender   = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
    if (sender && camTrack) await sender.replaceTrack(camTrack).catch(() => {});
    setIsScreenSharing(false);
  }, []);

  const stopScreenShare = stopScreenShareInternal;

  // ── Socket signaling listeners ───────────────────────────────────────────────
  useEffect(() => {
    if (!connected) return;
    const socket = socketRef.current;
    if (!socket) return;

    const onOffer = ({ from, callerName, callerPhoto, callType, offer }) => {
      if (callStateRef.current !== CALL_STATE.IDLE) {
        socket.emit('call:busy', { to: from });
        return;
      }
      callInitTimeRef.current = Date.now();
      isCallerRef.current     = false;
      setCallState(CALL_STATE.INCOMING);
      setCallInfo({ peerId: from, peerName: callerName, peerPhoto: callerPhoto, callType, offer });
    };

    const onAnswer = async ({ answer }) => {
      try {
        clearTimeout(callTimeoutRef.current);
        await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
        for (const c of pendingCandidates.current) {
          await pcRef.current?.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        pendingCandidates.current = [];
        callStartTimeRef.current = Date.now();
        setCallState(CALL_STATE.ACTIVE);
        durationTimerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
      } catch (err) { console.error('[WebRTC] onAnswer:', err); }
    };

    const onIceCandidate = async ({ candidate }) => {
      if (pcRef.current?.remoteDescription) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        pendingCandidates.current.push(candidate);
      }
    };

    const onEnd = () => {
      const wasActive = callStateRef.current === CALL_STATE.ACTIVE;
      // If we were INCOMING and never answered, it's a missed call
      const wasMissed = callStateRef.current === CALL_STATE.INCOMING;
      cleanup(wasActive ? 'answered' : wasMissed ? 'missed' : null);
    };
    const onReject = () => { toast('Call declined', { icon: '📵' }); cleanup('cancelled'); };
    const onBusy   = () => { toast.error('User is busy on another call'); cleanup('busy'); };

    socket.on('call:offer',         onOffer);
    socket.on('call:answer',        onAnswer);
    socket.on('call:ice-candidate', onIceCandidate);
    socket.on('call:end',           onEnd);
    socket.on('call:reject',        onReject);
    socket.on('call:busy',          onBusy);

    return () => {
      socket.off('call:offer',         onOffer);
      socket.off('call:answer',        onAnswer);
      socket.off('call:ice-candidate', onIceCandidate);
      socket.off('call:end',           onEnd);
      socket.off('call:reject',        onReject);
      socket.off('call:busy',          onBusy);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, cleanup]);

  return {
    callState, callInfo, localStream, remoteStream,
    isMuted, isCameraOff, isScreenSharing, duration,
    startCall, answerCall, endCall, rejectCall,
    toggleMute, toggleCamera, startScreenShare, stopScreenShare,
  };
}
