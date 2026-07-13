// src/screens/CallScreen.js — full-screen call UI for voice, video, and screen share.
// Receives callType ('audio'|'video'|'screen'), peerId, peerName from route params.
// For incoming calls, receives the offer + from so answerCall() can be triggered immediately.
import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Avatar from '../components/Avatar';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import { useWebRTC } from '../hooks/useWebRTC';

function ControlBtn({ icon, label, onPress, color = '#fff', bgColor = 'rgba(255,255,255,0.15)', size = 26 }) {
  return (
    <TouchableOpacity style={[styles.ctrlBtn, { backgroundColor: bgColor }]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={size} color={color} />
      {label ? <Text style={[styles.ctrlLabel, { color }]}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

export default function CallScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { socketRef } = useChat();

  const {
    peerId, peerName, peerPhoto,
    callType = 'video',       // 'audio' | 'video' | 'screen'
    incoming = false,         // true when this screen is pushed by an incoming call
    incomingOffer,
  } = route.params || {};

  const endedRef = useRef(false);
  const handleCallEnded = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    if (navigation.canGoBack()) navigation.goBack();
  };

  const {
    localStream, remoteStream,
    callState, incomingCall,
    muted, videoOff, speakerOn,
    startCall, answerCall, rejectCall, endCall,
    startScreenShare,
    toggleMute, toggleVideo, toggleSpeaker,
  } = useWebRTC({ socketRef, user, onCallEnded: handleCallEnded });

  // Kick off the call when the screen mounts
  useEffect(() => {
    if (incoming) {
      // Pass the offer explicitly — this hook instance is fresh and hasn't received
      // the socket 'call:offer' event (the global ChatContext already handled it).
      answerCall({ from: peerId, callType, offer: incomingOffer, callerName: peerName });
    } else if (callType === 'screen') {
      startScreenShare({ peerId, peerName });
    } else {
      startCall({ peerId, peerName, callType });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isVideo  = callType === 'video' || callType === 'screen';
  const isScreen = callType === 'screen';

  const stateLabel =
    callState === 'calling'   ? 'Calling…' :
    callState === 'ringing'   ? 'Ringing…' :
    callState === 'connected' ? 'Connected' : '';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Remote stream (full screen) */}
      {remoteStream && isVideo ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
          mirror={false}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.audioBackground]}>
          <Avatar name={peerName} size={96} />
        </View>
      )}

      {/* Top bar: peer name + state */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.peerName}>{peerName}</Text>
        <Text style={styles.stateLabel}>{stateLabel}</Text>
        {isScreen && <Text style={styles.screenNote}>You are sharing your screen</Text>}
      </View>

      {/* Local preview (PiP, bottom-right) — only for video calls */}
      {localStream && isVideo && !isScreen ? (
        <RTCView
          streamURL={localStream.toURL()}
          style={[styles.localPreview, { bottom: insets.bottom + 120 }]}
          objectFit="cover"
          mirror
        />
      ) : null}

      {/* Controls */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
        <ControlBtn
          icon={muted ? 'microphone-off' : 'microphone'}
          label={muted ? 'Unmute' : 'Mute'}
          onPress={toggleMute}
          bgColor={muted ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)'}
        />
        {isVideo && !isScreen && (
          <ControlBtn
            icon={videoOff ? 'video-off' : 'video'}
            label={videoOff ? 'Start video' : 'Stop video'}
            onPress={toggleVideo}
            bgColor={videoOff ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)'}
          />
        )}
        <ControlBtn
          icon={speakerOn ? 'volume-high' : 'volume-off'}
          label="Speaker"
          onPress={toggleSpeaker}
        />
        {/* End call — red */}
        <ControlBtn
          icon="phone-hangup"
          label="End"
          onPress={endCall}
          bgColor="#EF4444"
          size={28}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111' },
  audioBackground: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a2e' },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    alignItems: 'center', paddingHorizontal: 24, paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  peerName:    { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 4 },
  stateLabel:  { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  screenNote:  { fontSize: 12, color: '#60A5FA', marginTop: 4 },
  localPreview: {
    position: 'absolute', right: 16, width: 96, height: 144,
    borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#fff',
  },
  controls: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)', paddingTop: 20,
  },
  ctrlBtn: {
    alignItems: 'center', justifyContent: 'center',
    width: 64, height: 64, borderRadius: 32,
  },
  ctrlLabel: { fontSize: 11, marginTop: 4, fontWeight: '600' },
});
