// src/hooks/useWebRTC.js — WebRTC peer connection for voice/video/screen-share calls.
// Signaling runs over the existing chat socket (ChatContext.socketRef).
// STUN: Google's free public servers — no TURN config needed for LAN/same-network calls;
// add TURN credentials here if the call needs to cross carrier-grade NAT.
import { useRef, useState, useCallback, useEffect } from 'react';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useWebRTC({ socketRef, user, onCallEnded }) {
  const pcRef          = useRef(null);
  const localStreamRef = useRef(null);

  const [localStream,  setLocalStream]  = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callState,    setCallState]    = useState('idle'); // idle | ringing | calling | connected | ended
  const [incomingCall, setIncomingCall] = useState(null);  // { from, callerName, callerPhoto, callType, offer }
  const [activeCall,   setActiveCall]   = useState(null);  // { peerId, peerName, callType }
  const [muted,        setMuted]        = useState(false);
  const [videoOff,     setVideoOff]     = useState(false);
  const [speakerOn,    setSpeakerOn]    = useState(true);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setActiveCall(null);
    setIncomingCall(null);
    setMuted(false);
    setVideoOff(false);
  }, []);

  // ── Create peer connection ────────────────────────────────────────────────
  const createPC = useCallback((peerId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socketRef.current?.emit('call:ice-candidate', { to: peerId, candidate });
      }
    };

    pc.ontrack = ({ streams }) => {
      if (streams?.[0]) setRemoteStream(streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCallState('connected');
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        cleanup();
        onCallEnded?.();
      }
    };

    return pc;
  }, [socketRef, cleanup, onCallEnded]);

  // ── Get local media ──────────────────────────────────────────────────────
  const getLocalStream = useCallback(async (callType) => {
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video' ? { facingMode: 'user' } : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  // ── Start outgoing call ──────────────────────────────────────────────────
  const startCall = useCallback(async ({ peerId, peerName, callType = 'video' }) => {
    try {
      setCallState('calling');
      setActiveCall({ peerId, peerName, callType });

      const stream = await getLocalStream(callType);
      const pc = createPC(peerId);

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current?.emit('call:offer', {
        to: peerId,
        offer,
        callerName:  user?.full_name || user?.name,
        callerPhoto: user?.photo_url || null,
        callType,
      });
    } catch (e) {
      console.warn('startCall error', e);
      cleanup();
      onCallEnded?.();
    }
  }, [getLocalStream, createPC, socketRef, user, cleanup, onCallEnded]);

  // ── Answer incoming call ─────────────────────────────────────────────────
  // Accepts explicit { from, callType, offer, callerName } for the case where
  // CallScreen is pushed fresh (before this hook's incomingCall state is set).
  const answerCall = useCallback(async (explicit) => {
    const call = explicit || incomingCall;
    if (!call) return;
    const { from, callType, offer, callerName } = call;
    try {
      setCallState('connected');
      setActiveCall({ peerId: from, peerName: callerName, callType });

      const stream = await getLocalStream(callType);
      const pc = createPC(from);

      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current?.emit('call:answer', { to: from, answer });
      setIncomingCall(null);
    } catch (e) {
      console.warn('answerCall error', e);
      cleanup();
      onCallEnded?.();
    }
  }, [incomingCall, getLocalStream, createPC, socketRef, cleanup, onCallEnded]);

  // ── Reject / end call ────────────────────────────────────────────────────
  const rejectCall = useCallback(() => {
    if (incomingCall) {
      socketRef.current?.emit('call:reject', { to: incomingCall.from });
    }
    cleanup();
    onCallEnded?.();
  }, [incomingCall, socketRef, cleanup, onCallEnded]);

  const endCall = useCallback(() => {
    if (activeCall) {
      socketRef.current?.emit('call:end', { to: activeCall.peerId });
    }
    cleanup();
    onCallEnded?.();
  }, [activeCall, socketRef, cleanup, onCallEnded]);

  // ── Screen share ─────────────────────────────────────────────────────────
  const startScreenShare = useCallback(async ({ peerId, peerName }) => {
    try {
      setCallState('calling');
      setActiveCall({ peerId, peerName, callType: 'screen' });

      const stream = await mediaDevices.getDisplayMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPC(peerId);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current?.emit('screenshare:offer', {
        to: peerId,
        offer,
        sharerName:  user?.full_name || user?.name,
        sharerPhoto: user?.photo_url || null,
      });

      // When screen stream ends natively (user swipes away), end the call too
      stream.getVideoTracks()[0]?.addEventListener('ended', () => endCall());
    } catch (e) {
      console.warn('startScreenShare error', e);
      cleanup();
      onCallEnded?.();
    }
  }, [createPC, socketRef, user, cleanup, onCallEnded, endCall]);

  // ── Toggle mute / camera / speaker ───────────────────────────────────────
  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMuted(v => !v);
  }, []);

  const toggleVideo = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setVideoOff(v => !v);
  }, []);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn(v => !v);
    // react-native-webrtc exposes InCallManager for speaker toggle on Android;
    // if InCallManager is not available (Expo Go), this is silently ignored.
    try {
      const { InCallManager } = require('react-native-incall-manager');
      InCallManager.setSpeakerphoneOn(!speakerOn);
    } catch (_) {}
  }, [speakerOn]);

  // ── Socket listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const onOffer = ({ from, callerName, callerPhoto, callType, offer }) => {
      if (callState !== 'idle') {
        socketRef.current?.emit('call:busy', { to: from });
        return;
      }
      setIncomingCall({ from, callerName, callerPhoto, callType, offer });
      setCallState('ringing');
    };

    const onAnswer = async ({ answer }) => {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
      setCallState('connected');
    };

    const onIce = async ({ candidate }) => {
      try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
    };

    const onEnd     = () => { cleanup(); onCallEnded?.(); };
    const onReject  = () => { cleanup(); onCallEnded?.(); };
    const onBusy    = () => { cleanup(); onCallEnded?.(); };

    const onSSAnswer = async ({ answer }) => {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
      setCallState('connected');
    };
    const onSSIce = async ({ candidate }) => {
      try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
    };
    const onSSEnd = () => { cleanup(); onCallEnded?.(); };

    socket.on('call:offer',         onOffer);
    socket.on('call:answer',        onAnswer);
    socket.on('call:ice-candidate', onIce);
    socket.on('call:end',           onEnd);
    socket.on('call:reject',        onReject);
    socket.on('call:busy',          onBusy);
    socket.on('screenshare:answer',        onSSAnswer);
    socket.on('screenshare:ice-candidate', onSSIce);
    socket.on('screenshare:end',           onSSEnd);

    return () => {
      socket.off('call:offer',         onOffer);
      socket.off('call:answer',        onAnswer);
      socket.off('call:ice-candidate', onIce);
      socket.off('call:end',           onEnd);
      socket.off('call:reject',        onReject);
      socket.off('call:busy',          onBusy);
      socket.off('screenshare:answer',        onSSAnswer);
      socket.off('screenshare:ice-candidate', onSSIce);
      socket.off('screenshare:end',           onSSEnd);
    };
  }, [socketRef, callState, cleanup, onCallEnded]);

  return {
    localStream, remoteStream,
    callState, incomingCall, activeCall,
    muted, videoOff, speakerOn,
    startCall, answerCall, rejectCall, endCall,
    startScreenShare,
    toggleMute, toggleVideo, toggleSpeaker,
  };
}
