import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e) {
      Alert.alert(
        'Login Failed',
        e?.response?.data?.error || e?.response?.data?.message || 'Invalid credentials. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <View style={styles.logo}><Text style={styles.logoText}>BC</Text></View>
        <Text style={styles.appName}>BCIM ERP</Text>
        <Text style={styles.sub}>Sign in to your account</Text>

        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor="#64748B"
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#64748B"
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Sign In</Text>}
        </TouchableOpacity>

        <Text style={styles.hint}>Use your BCIM ERP credentials</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap:     { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', padding: 24 },
  card:     { backgroundColor: '#1E293B', borderRadius: 20, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  logo:     { width: 60, height: 60, borderRadius: 14, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  logoText: { color: '#fff', fontWeight: '800', fontSize: 20, letterSpacing: -0.5 },
  appName:  { fontSize: 24, fontWeight: '800', color: '#F8FAFC', letterSpacing: -0.5 },
  sub:      { fontSize: 14, color: '#94A3B8', marginTop: 4, marginBottom: 28 },
  input:    {
    width: '100%', backgroundColor: '#0F172A', borderRadius: 10, padding: 14,
    color: '#F8FAFC', fontSize: 15, marginBottom: 12,
    borderWidth: 1, borderColor: '#334155',
  },
  btn:      { width: '100%', backgroundColor: '#2563EB', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 4 },
  btnText:  { color: '#fff', fontWeight: '700', fontSize: 16 },
  hint:     { color: '#475569', fontSize: 12, marginTop: 16 },
});
