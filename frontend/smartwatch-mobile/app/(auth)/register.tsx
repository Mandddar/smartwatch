import { useState, useRef } from 'react';
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
  Modal,
  FlatList,
} from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { register } from '@/lib/api';

const C = {
  bg: '#0b1120',
  card: '#141f35',
  cardBorder: '#1e3356',
  primary: '#5a7fbf',
  text: '#e8f0fe',
  textSub: '#7a97c0',
  textMuted: '#3d5478',
  inputBg: '#0d1829',
  inputBorder: '#1e3356',
  hr: '#c75e6b',
};

const GENDERS = ['Male', 'Female', 'Other'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

function DatePickerModal({
  visible,
  day, month, year,
  onConfirm, onClose,
}: {
  visible: boolean;
  day: number; month: number; year: number;
  onConfirm: (d: number, m: number, y: number) => void;
  onClose: () => void;
}) {
  const [selDay, setSelDay] = useState(day);
  const [selMonth, setSelMonth] = useState(month);
  const [selYear, setSelYear] = useState(year);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);
  const daysInMonth = getDaysInMonth(selMonth, selYear);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Clamp day if month changes
  const clampedDay = Math.min(selDay, daysInMonth);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={dp.overlay}>
        <View style={dp.sheet}>
          <View style={dp.sheetHeader}>
            <Text style={dp.sheetTitle}>Select Date of Birth</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.textSub} />
            </TouchableOpacity>
          </View>

          <View style={dp.columns}>
            {/* Day */}
            <View style={dp.col}>
              <Text style={dp.colLabel}>Day</Text>
              <FlatList
                data={days}
                keyExtractor={(d) => String(d)}
                showsVerticalScrollIndicator={false}
                style={dp.colList}
                initialScrollIndex={Math.max(0, clampedDay - 1)}
                getItemLayout={(_, i) => ({ length: 44, offset: 44 * i, index: i })}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[dp.colItem, item === clampedDay && dp.colItemActive]}
                    onPress={() => setSelDay(item)}
                  >
                    <Text style={[dp.colItemText, item === clampedDay && dp.colItemTextActive]}>
                      {String(item).padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>

            {/* Month */}
            <View style={[dp.col, dp.colWide]}>
              <Text style={dp.colLabel}>Month</Text>
              <FlatList
                data={MONTHS}
                keyExtractor={(m) => m}
                showsVerticalScrollIndicator={false}
                style={dp.colList}
                initialScrollIndex={Math.max(0, selMonth - 1)}
                getItemLayout={(_, i) => ({ length: 44, offset: 44 * i, index: i })}
                renderItem={({ item, index }) => {
                  const mNum = index + 1;
                  return (
                    <TouchableOpacity
                      style={[dp.colItem, mNum === selMonth && dp.colItemActive]}
                      onPress={() => setSelMonth(mNum)}
                    >
                      <Text style={[dp.colItemText, mNum === selMonth && dp.colItemTextActive]}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>

            {/* Year */}
            <View style={dp.col}>
              <Text style={dp.colLabel}>Year</Text>
              <FlatList
                data={years}
                keyExtractor={(y) => String(y)}
                showsVerticalScrollIndicator={false}
                style={dp.colList}
                initialScrollIndex={Math.max(0, years.indexOf(selYear))}
                getItemLayout={(_, i) => ({ length: 44, offset: 44 * i, index: i })}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[dp.colItem, item === selYear && dp.colItemActive]}
                    onPress={() => setSelYear(item)}
                  >
                    <Text style={[dp.colItemText, item === selYear && dp.colItemTextActive]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>

          <TouchableOpacity
            style={dp.confirmBtn}
            onPress={() => onConfirm(clampedDay, selMonth, selYear)}
          >
            <Text style={dp.confirmBtnText}>Confirm Date</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [gender, setGender] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dobDay, setDobDay] = useState(1);
  const [dobMonth, setDobMonth] = useState(1);
  const [dobYear, setDobYear] = useState(1990);
  const [dobSet, setDobSet] = useState(false);
  const { setAuth } = useAuth();

  function formatDob(d: number, m: number, y: number) {
    return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
  }

  function toApiDob(d: number, m: number, y: number) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  async function handleRegister() {
    if (!name.trim() || !email.trim() || !password || !dobSet) {
      Alert.alert('Missing Fields', 'Please fill in all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const res = await register(
        name.trim(), email.trim(), password,
        toApiDob(dobDay, dobMonth, dobYear),
        gender || undefined
      );
      await setAuth(res.token, res.email);
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('Registration Failed', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function inputStyle(field: string) {
    return [styles.inputWrapper, focusedField === field && styles.inputWrapperFocused];
  }
  function iconColor(field: string) {
    return focusedField === field ? C.primary : C.textMuted;
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
          <Text style={styles.brandTagline}>Create your health profile</Text>
        </View>

        {/* Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create account</Text>
          <Text style={styles.cardSubtitle}>Fill in your details to get started</Text>

          {/* Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <View style={inputStyle('name')}>
              <Ionicons name="person-outline" size={18} color={iconColor('name')} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Jane Smith"
                placeholderTextColor={C.textMuted}
                value={name}
                onChangeText={setName}
                returnKeyType="next"
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <View style={inputStyle('email')}>
              <Ionicons name="mail-outline" size={18} color={iconColor('email')} style={styles.inputIcon} />
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

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={inputStyle('password')}>
              <Ionicons name="lock-closed-outline" size={18} color={iconColor('password')} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.inputWithToggle]}
                placeholder="Min. 6 characters"
                placeholderTextColor={C.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="next"
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.textSub} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Confirm Password</Text>
            <View style={[
              inputStyle('confirm'),
              confirmPassword.length > 0 && password !== confirmPassword && styles.inputWrapperError,
            ]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={
                confirmPassword.length > 0
                  ? password === confirmPassword ? '#5ba88a' : C.hr
                  : iconColor('confirm')
              } style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.inputWithToggle]}
                placeholder="Re-enter password"
                placeholderTextColor={C.textMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                returnKeyType="next"
                onFocus={() => setFocusedField('confirm')}
                onBlur={() => setFocusedField(null)}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeBtn}>
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.textSub} />
              </TouchableOpacity>
            </View>
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <Text style={styles.errorHint}>Passwords do not match</Text>
            )}
            {confirmPassword.length > 0 && password === confirmPassword && (
              <Text style={styles.successHint}>✓ Passwords match</Text>
            )}
          </View>

          {/* Date of Birth */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Date of Birth</Text>
            <TouchableOpacity
              style={[styles.inputWrapper, styles.dobBtn, focusedField === 'dob' && styles.inputWrapperFocused]}
              onPress={() => { setShowDatePicker(true); setFocusedField('dob'); }}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar" size={18} color={dobSet ? C.primary : C.textMuted} style={styles.inputIcon} />
              <Text style={[styles.dobText, !dobSet && styles.dobPlaceholder]}>
                {dobSet ? formatDob(dobDay, dobMonth, dobYear) : 'DD  Month  YYYY'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={C.textMuted} style={{ marginRight: 14 }} />
            </TouchableOpacity>
          </View>

          {/* Gender */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              Gender <Text style={styles.optional}>(optional)</Text>
            </Text>
            <View style={styles.genderRow}>
              {GENDERS.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.genderBtn, gender === g && styles.genderBtnActive]}
                  onPress={() => setGender(gender === g ? '' : g)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.genderBtnText, gender === g && styles.genderBtnTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <>
                <Ionicons name="sync-outline" size={18} color={C.text} style={{ marginRight: 8 }} />
                <Text style={styles.buttonText}>Creating account...</Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color={C.text} style={{ marginRight: 8 }} />
                <Text style={styles.buttonText}>Create Account</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.footer}>
            <Text style={styles.footerText}>
              Already have an account?{' '}
              <Text style={styles.footerLink}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>

      <DatePickerModal
        visible={showDatePicker}
        day={dobDay} month={dobMonth} year={dobYear}
        onConfirm={(d, m, y) => {
          setDobDay(d); setDobMonth(m); setDobYear(y);
          setDobSet(true);
          setShowDatePicker(false);
          setFocusedField(null);
        }}
        onClose={() => { setShowDatePicker(false); setFocusedField(null); }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 40, paddingBottom: 40 },

  brandSection: { alignItems: 'center', marginBottom: 28 },
  iconWrapper: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: 'rgba(90,127,191,0.15)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, borderWidth: 1.5,
    borderColor: 'rgba(90,127,191,0.35)',
  },
  brandName: { fontSize: 32, fontWeight: '800', color: C.text, letterSpacing: 0.5 },
  brandTagline: { fontSize: 14, color: C.textSub, marginTop: 5 },

  card: {
    backgroundColor: C.card, borderRadius: 22, padding: 24,
    borderWidth: 1, borderColor: C.cardBorder, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 24, elevation: 10,
  },
  cardTitle: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: C.textSub, marginBottom: 24 },

  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: C.textSub, marginBottom: 7, letterSpacing: 0.3 },
  optional: { fontWeight: '400', color: C.textMuted },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.inputBg, borderRadius: 13,
    borderWidth: 1.5, borderColor: C.inputBorder,
  },
  inputWrapperFocused: { borderColor: C.primary, backgroundColor: 'rgba(90,127,191,0.06)' },
  inputWrapperError: { borderColor: C.hr, backgroundColor: 'rgba(199,94,107,0.05)' },
  inputIcon: { paddingHorizontal: 13 },
  input: { flex: 1, paddingVertical: 14, paddingRight: 14, fontSize: 15, color: C.text },
  inputWithToggle: { paddingRight: 0 },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },
  errorHint: { fontSize: 12, color: C.hr, marginTop: 5, marginLeft: 4 },
  successHint: { fontSize: 12, color: '#5ba88a', marginTop: 5, marginLeft: 4 },

  dobBtn: { justifyContent: 'space-between' },
  dobText: { flex: 1, fontSize: 15, color: C.text, paddingVertical: 14 },
  dobPlaceholder: { color: C.textMuted },

  genderRow: { flexDirection: 'row', gap: 10 },
  genderBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 11,
    borderWidth: 1.5, borderColor: C.inputBorder,
    alignItems: 'center', backgroundColor: C.inputBg,
  },
  genderBtnActive: { backgroundColor: 'rgba(90,127,191,0.15)', borderColor: C.primary },
  genderBtnText: { fontSize: 14, fontWeight: '600', color: C.textMuted },
  genderBtnTextActive: { color: C.primary },

  button: {
    backgroundColor: C.primary, borderRadius: 13, padding: 16,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
    marginTop: 8, shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4,
    shadowRadius: 12, elevation: 6,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: C.text, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  footer: { alignItems: 'center', padding: 12 },
  footerText: { color: C.textSub, fontSize: 14 },
  footerLink: { color: C.primary, fontWeight: '700' },
});

const dp = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#141f35', borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 24, paddingBottom: 40,
    borderWidth: 1, borderColor: '#1e3356',
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#e8f0fe' },
  columns: { flexDirection: 'row', gap: 8, height: 220 },
  col: { flex: 1 },
  colWide: { flex: 2 },
  colLabel: {
    fontSize: 11, fontWeight: '700', color: '#3d5478',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 6, textAlign: 'center',
  },
  colList: { flex: 1 },
  colItem: {
    height: 44, justifyContent: 'center', alignItems: 'center',
    borderRadius: 10, marginVertical: 1,
  },
  colItemActive: { backgroundColor: 'rgba(90,127,191,0.2)', borderWidth: 1, borderColor: 'rgba(90,127,191,0.4)' },
  colItemText: { fontSize: 15, color: '#7a97c0', fontWeight: '500' },
  colItemTextActive: { color: '#5a7fbf', fontWeight: '700' },
  confirmBtn: {
    backgroundColor: '#5a7fbf', borderRadius: 13, padding: 15,
    alignItems: 'center', marginTop: 16,
    shadowColor: '#5a7fbf', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  confirmBtnText: { color: '#e8f0fe', fontSize: 16, fontWeight: '700' },
});
