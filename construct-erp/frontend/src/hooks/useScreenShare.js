// src/hooks/useScreenShare.js — WebRTC screen share with laser pointer via DataChannel.
// Sharer: getDisplayMedia → offer → video track to viewer.
// Viewer: accepts → sees fullscreen stream → mousemove sends {x,y} ratios via DataChannel.
// Sharer sees a floating preview with a red dot at the viewer's cursor position.
import { useRef, useState, useCallback, useEffect } from 'react';

const STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export const SHARE_STATE = {
  IDLE:     'idle',
  SHARING:  'sharing',   // I am sharing my screen
  INCOMING: 'incoming',  // Someone wants to share with me
  VIEWING:  'viewing',   // I am viewing someone else's screen
};

export function useScreenShare({ socketRef, connected, currentUser }) {
  const [shareState,   setShareState]   = useState(SHARE_STATE.IDLE);
  const [shareInfo,    setShareInfo]    = useState(null);
  const [screenStream, setScreenStream] = useState(null); // sharer's local stream
  const [viewerStream, setViewerStream] = useState(null); // viewer's remote stream
  const [pointerPos,   setPointerPos]   = useState(null); // {x,y} 0-1 from viewer

  const pcRef             = useRef(null);
  const screenStreamRef   = useRef(null);
  const dataChannelRef    = useRef(null);
  const shareStateRef     = useRef(SHARE_STATE.IDLE);
  const shareInfoRef      = useRef(null);
  const pendingCandidates = useRef([]);
  const ptrThrottle       = useRef(null);

  useEffect(() => { shareStateRef.current = shareState; }, [shareState]);
  useEffect(() => { shareInfoRef.current  = shareInfo;  }, [shareInfo]);

  const cleanup = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    if (dataChannelRef.current) { dataChannelRef.current.close(); dataChannelRef.current = null; }
    if (pcRef.current)          { pcRef.current.close();          pcRef.current = null; }
    setShareState(SHARE_STATE.IDLE);
    setShareInfo(null);
    setScreenStream(null);
    setViewerStream(null);
    setPointerPos(null);
    pendingCandidates.current = [];
  }, []);

  const createPC = useCallback((peerId, isSharer) => {
    const pc = new RTCPeerConnection({ iceServers: STUN });

    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit('screenshare:ice-candidate', { to: peerId, candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) cleanup();
    };

    if (isSharer) {
      const dc = pc.createDataChannel('pointer', { ordered: false, maxRetransmits: 0 });
      dataChannelRef.current = dc;
    } else {
      pc.ondatachannel = (e) => {
        dataChannelRef.current = e.channel;
        e.channel.onmessage = (ev) => {
          try { setPointerPos(JSON.parse(ev.data)); } catch {}
        };
      };
      pc.ontrack = (e) => setViewerStream(e.streams[0] || null);
    }

    pcRef.current = pc;
    return pc;
  }, [socketRef, cleanup]);

  // ── Start sharing ─────────────────────────────────────────────────────────────
  const startShare = useCallback(async (peer) => {
    if (shareStateRef.current !== SHARE_STATE.IDLE) return;

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always', frameRate: { ideal: 30 } },
      audio: false,
    });
    screenStreamRef.current = stream;
    setScreenStream(stream);

    // If user dismisses the browser's native share picker
    stream.getVideoTracks()[0].onended = () => stopShare();

    const pc = createPC(peer.id, true);
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    setShareState(SHARE_STATE.SHARING);
    setShareInfo({ peerId: peer.id, peerName: peer.full_name || peer.name || 'User', peerPhoto: peer.profile_photo_url });

    socketRef.current?.emit('screenshare:offer', {
      to:    peer.id,
      offer,
      sharerName:  currentUser?.full_name || currentUser?.name,
      sharerPhoto: currentUser?.profile_photo_url,
    });
  }, [createPC, socketRef, currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Accept incoming share ──────────────────────────────────────────────────────
  const acceptShare = useCallback(async () => {
    const info = shareInfoRef.current;
    if (shareStateRef.current !== SHARE_STATE.INCOMING || !info) return;

    const pc = createPC(info.peerId, false);
    await pc.setRemoteDescription(new RTCSessionDescription(info.offer));
    for (const c of pendingCandidates.current) {
      await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
    pendingCandidates.current = [];

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketRef.current?.emit('screenshare:answer', { to: info.peerId, answer });
    setShareState(SHARE_STATE.VIEWING);
  }, [createPC, socketRef]);

  // ── Stop / decline ────────────────────────────────────────────────────────────
  const stopShare = useCallback(() => {
    const info = shareInfoRef.current;
    if (info?.peerId) socketRef.current?.emit('screenshare:end', { to: info.peerId });
    cleanup();
  }, [socketRef, cleanup]);

  // ── Send pointer position (viewer → sharer, throttled 30 fps) ─────────────────
  const sendPointer = useCallback((x, y) => {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== 'open') return;
    if (ptrThrottle.current) return;
    ptrThrottle.current = setTimeout(() => { ptrThrottle.current = null; }, 33);
    dc.send(JSON.stringify({ x, y }));
  }, []);

  // ── Socket listeners ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!connected) return;
    const socket = socketRef.current;
    if (!socket) return;

    const onOffer = ({ from, sharerName, sharerPhoto, offer }) => {
      if (shareStateRef.current !== SHARE_STATE.IDLE) return;
      setShareState(SHARE_STATE.INCOMING);
      setShareInfo({ peerId: from, peerName: sharerName, peerPhoto: sharerPhoto, offer });
    };

    const onAnswer = async ({ answer }) => {
      try {
        await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
        for (const c of pendingCandidates.current) {
          await pcRef.current?.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        pendingCandidates.current = [];
      } catch (err) { console.error('[ScreenShare] onAnswer:', err); }
    };

    const onIceCandidate = async ({ candidate }) => {
      if (pcRef.current?.remoteDescription) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        pendingCandidates.current.push(candidate);
      }
    };

    const onEnd = () => cleanup();

    socket.on('screenshare:offer',         onOffer);
    socket.on('screenshare:answer',        onAnswer);
    socket.on('screenshare:ice-candidate', onIceCandidate);
    socket.on('screenshare:end',           onEnd);

    return () => {
      socket.off('screenshare:offer',         onOffer);
      socket.off('screenshare:answer',        onAnswer);
      socket.off('screenshare:ice-candidate', onIceCandidate);
      socket.off('screenshare:end',           onEnd);
    };
  }, [connected, cleanup]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    shareState, shareInfo, screenStream, viewerStream, pointerPos,
    startShare, acceptShare, stopShare, sendPointer,
  };
}
