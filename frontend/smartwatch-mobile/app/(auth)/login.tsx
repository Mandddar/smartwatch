import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { login } from '@/lib/api';

const C = {
  bg: '#0b1120',
  card: '#141f35',
  cardBorder: '#1e3356',
  primary: '#4d8af0',
  text: '#e8f0fe',
  textSub: '#7a97c0',
  textMuted: '#3d5478',
  inputBg: '#0d1829',
  inputBorder: '#1e3356',
  inputFocus: '#4d8af0',
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { setAuth } = useAuth();

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Missing Fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await login(email.trim(), password);
      await setAuth(res.token, res.email);
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('Login Failed', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand */}
        <View style={styles.brandSection}>
          <View style={styles.iconWrapper}>
            <Ionicons name="watch" size={40} color={C.primary} />
          </View>
          <Text style={styles.brandName}>VitalWatch</Text>
          <Text style={styles.brandTagline}>Your health, always in view</Text>
        </View>

        {/* Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome back</Text>
          <Text style={styles.cardSubtitle}>Sign in to your account</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <View style={[styles.inputWrapper, focusedField === 'email' && styles.inputWrapperFocused]}>
              <Ionicons name="mail-outline" size={18} color={focusedField === 'email' ? C.primary : C.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={C.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={[styles.inputWrapper, focusedField === 'password' && styles.inputWrapperFocused]}>
              <Ionicons name="lock-closed-outline" size={18} color={focusedField === 'password' ? C.primary : C.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.inputWithToggle]}
                placeholder="Your password"
                placeholderTextColor={C.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color={showPassword ? C.primary : C.textSub} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <>
                <Ionicons name="sync-outline" size={18} color={C.text} style={{ marginRight: 8 }} />
                <Text style={styles.buttonText}>Signing in...</Text>
              </>
            ) : (
              <>
                <Ionicons name="log-in-outline" size={18} color={C.text} style={{ marginRight: 8 }} />
                <Text style={styles.buttonText}>Sign In</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Link href="/(auth)/register" asChild>
          <TouchableOpacity style={styles.footer}>
            <Text style={styles.footerText}>
              Don't have an account?{' '}
              <Text style={styles.footerLink}>Create one</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, padding: 24, justifyContent: 'center' },

  brandSection: { alignItems: 'center', marginBottom: 36 },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(77,138,240,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(77,138,240,0.35)',
  },
  brandName: { fontSize: 32, fontWeight: '800', color: C.text, letterSpacing: 0.5 },
  brandTagline: { fontSize: 14, color: C.textSub, marginTop: 5 },

  card: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: C.cardBorder,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  cardTitle: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: C.textSub, marginBottom: 24 },

  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: C.textSub, marginBottom: 7, letterSpacing: 0.3 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.inputBg,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: C.inputBorder,
  },
  inputWrapperFocused: {
    borderColor: C.primary,
    backgroundColor: 'rgba(77,138,240,0.06)',
  },
  inputIcon: { paddingHorizontal: 13 },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingRight: 14,
    fontSize: 15,
    color: C.text,
  },
  inputWithToggle: { paddingRight: 0 },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },

  button: {
    backgroundColor: C.primary,
    borderRadius: 13,
    padding: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: C.text, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  footer: { alignItems: 'center', padding: 12 },
  footerText: { color: C.textSub, fontSize: 14 },
  footerLink: { color: C.primary, fontWeight: '700' },
});
