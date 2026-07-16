// src/components/IncomingCallModal.js — full-screen incoming call sheet.
// Shown app-wide (in App.js) whenever ChatContext.incomingCall is set.
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Vibration,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Avatar from './Avatar';
import { useChat } from '../context/ChatContext';

const CALL_ICONS = {
  audio:  'phone',
  video:  'video',
  screen: 'monitor-share',
};
const CALL_LABELS = {
  audio:  'Voice call',
  video:  'Video call',
  screen: 'Screen share',
};

export default function IncomingCallModal() {
  const { incomingCall, dismissIncomingCall, socketRef } = useChat();
  const navigation = useNavigation();

  React.useEffect(() => {
    if (incomingCall) {
      Vibration.vibrate([500, 500, 500, 500, 500, 500], true);
      return () => Vibration.cancel();
    }
  }, [!!incomingCall]);

  if (!incomingCall) return null;
  const { from, callerName, callerPhoto, callType = 'video', offer } = incomingCall;

  const reject = () => {
    socketRef.current?.emit('call:reject', { to: from });
    dismissIncomingCall();
  };

  const accept = () => {
    dismissIncomingCall();
    navigation.navigate('Call', {
      peerId: from, peerName: callerName,
      callType, incoming: true, incomingOffer: offer,
    });
  };

  return (
    <Modal transparent animationType="slide" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.callType}>
            <MaterialCommunityIcons name={CALL_ICONS[callType] || 'phone'} size={14} />{' '}
            Incoming {CALL_LABELS[callType] || 'call'}
          </Text>
          <Avatar name={callerName} size={72} style={{ marginVertical: 16 }} />
          <Text style={styles.callerName}>{callerName}</Text>

          <View style={styles.btns}>
            <TouchableOpacity style={[styles.btn, styles.rejectBtn]} onPress={reject}>
              <MaterialCommunityIcons name="phone-hangup" size={30} color="#fff" />
              <Text style={styles.btnLabel}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.acceptBtn]} onPress={accept}>
              <MaterialCommunityIcons name={CALL_ICONS[callType] || 'phone'} size={30} color="#fff" />
              <Text style={styles.btnLabel}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#1a1a2e', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 28, paddingBottom: 40, paddingHorizontal: 32,
    alignItems: 'center',
  },
  callType:   { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
  callerName: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 28 },
  btns:       { flexDirection: 'row', gap: 40 },
  btn:        { alignItems: 'center', width: 70, height: 70, borderRadius: 35, justifyContent: 'center' },
  rejectBtn:  { backgroundColor: '#EF4444' },
  acceptBtn:  { backgroundColor: '#22C55E' },
  btnLabel:   { fontSize: 12, color: '#fff', fontWeight: '600', marginTop: 4, position: 'absolute', bottom: -20 },
});
