import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ScrollView,
  Platform,
  TextInput,
  Pressable,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import {
  getPreferences,
  updatePreferences,
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
} from '@/lib/api';
import { getModelStatus } from '@/lib/ml';
import { useTheme } from '@/lib/theme';
import { getPendingSyncCount } from '@/lib/sync/syncService';
import { computeLocalBaselines } from '@/lib/ml/baselines';

function confirmAction(title: string, message: string, onConfirm: () => void, confirmLabel = 'Confirm') {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: onConfirm },
    ]);
  }
}

const C = {
  bg: '#0b1120',
  card: '#141f35',
  cardBorder: '#1e3356',
  primary: '#5a7fbf',
  hr: '#c75e6b',
  steps: '#5ba88a',
  sleep: '#8b7db8',
  alert: '#c99a4a',
  text: '#e8f0fe',
  textSub: '#7a97c0',
  textMuted: '#3d5478',
};

const AVATAR_COLORS = ['#5a7fbf', '#c75e6b', '#5ba88a', '#8b7db8', '#c99a4a', '#5a9bb5'];

function getAvatarColor(name: string): string {
  if (!name || name.length === 0) return AVATAR_COLORS[0];
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

export default function ProfileScreen() {
  const { token, userEmail, setAuth } = useAuth();
  const { isDark, toggle: toggleTheme } = useTheme();
  const [enableHeartRateAlerts, setEnableHeartRateAlerts] = useState(true);
  const [enableGeneralAlerts, setEnableGeneralAlerts] = useState(true);
  const [prefLoading, setPrefLoading] = useState(false);

  // Profile state
  const [profileName, setProfileName] = useState('');
  const [profileGender, setProfileGender] = useState('');
  const [profileDob, setProfileDob] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [profileMsg, setProfileMsg] = useState('');

  // Password change
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleteMsg, setDeleteMsg] = useState('');

  // Step goal
  const [stepGoal, setStepGoal] = useState(10000);
  const [editingGoal, setEditingGoal] = useState(false);
  const [tempGoal, setTempGoal] = useState('10000');

  useEffect(() => {
    if (!token) return;
    getPreferences(token).then((p) => {
      setEnableHeartRateAlerts(p.enableHeartRateAlerts);
      setEnableGeneralAlerts(p.enableGeneralAlerts);
    }).catch(() => {});

    getProfile(token).then((p) => {
      setProfileName(p.name || '');
      setProfileGender(p.gender || '');
      setProfileDob(p.dateOfBirth || '');
      setEditName(p.name || '');
    }).catch(() => {});

    // Load step goal from localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('vw_step_goal');
      if (saved) { setStepGoal(parseInt(saved, 10)); setTempGoal(saved); }
    }
  }, [token]);

  async function updatePref(field: 'heartRate' | 'general', value: boolean) {
    if (!token) return;
    if (field === 'heartRate') setEnableHeartRateAlerts(value);
    else setEnableGeneralAlerts(value);
    setPrefLoading(true);
    try {
      const res = await updatePreferences(
        token,
        field === 'heartRate' ? value : undefined,
        field === 'general' ? value : undefined
      );
      setEnableHeartRateAlerts(res.enableHeartRateAlerts);
      setEnableGeneralAlerts(res.enableGeneralAlerts);
    } catch (e) {
      if (field === 'heartRate') setEnableHeartRateAlerts(!value);
      else setEnableGeneralAlerts(!value);
    } finally {
      setPrefLoading(false);
    }
  }

  async function handleSaveProfile() {
    if (!token) return;
    try {
      const res = await updateProfile(token, { name: editName.trim() });
      setProfileName(res.name);
      setEditingProfile(false);
      setProfileMsg('Profile updated');
      setTimeout(() => setProfileMsg(''), 2000);
    } catch (e) {
      setProfileMsg((e as Error).message);
    }
  }

  async function handleChangePassword() {
    setPwMsg('');
    if (newPw !== confirmPw) { setPwMsg('Passwords do not match'); return; }
    if (newPw.length < 6) { setPwMsg('Password must be at least 6 characters'); return; }
    setPwLoading(true);
    try {
      await changePassword(token, currentPw, newPw);
      setPwMsg('Password changed successfully!');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => { setShowPasswordModal(false); setPwMsg(''); }, 1500);
    } catch (e) {
      setPwMsg((e as Error).message);
    } finally {
      setPwLoading(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteMsg('');
    try {
      await deleteAccount(token, deletePw);
      await setAuth(null, null);
      router.replace('/(auth)/login');
    } catch (e) {
      setDeleteMsg((e as Error).message);
    }
  }

  function handleSaveGoal() {
    const val = parseInt(tempGoal, 10);
    if (isNaN(val) || val < 100) return;
    setStepGoal(val);
    setEditingGoal(false);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('vw_step_goal', String(val));
    }
  }

  function handleLogout() {
    confirmAction('Sign Out', 'Are you sure you want to sign out?', async () => {
      await setAuth(null, null);
      router.replace('/(auth)/login');
    }, 'Sign Out');
  }

  const displayName = profileName || (userEmail
    ? userEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'User');

  const avatarColor = getAvatarColor(displayName);
  const initials = displayName.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Avatar Card + Editable Name */}
      <View style={styles.avatarCard}>
        <View style={[styles.avatarCircle, { borderColor: avatarColor + '60' }]}>
          <View style={[styles.avatarInner, { backgroundColor: avatarColor + '25' }]}>
            <Text style={[styles.avatarInitial, { color: avatarColor }]}>{initials}</Text>
          </View>
        </View>

        {editingProfile ? (
          <View style={styles.editRow}>
            <TextInput
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your name"
              placeholderTextColor={C.textMuted}
              autoFocus
            />
            <Pressable onPress={handleSaveProfile} style={styles.editSaveBtn}>
              <Ionicons name="checkmark" size={18} color={C.steps} />
            </Pressable>
            <Pressable onPress={() => { setEditingProfile(false); setEditName(profileName); }} style={styles.editCancelBtn}>
              <Ionicons name="close" size={18} color={C.hr} />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setEditingProfile(true)} style={styles.nameRow}>
            <Text style={styles.displayName}>{displayName}</Text>
            <Ionicons name="pencil" size={14} color={C.textMuted} />
          </Pressable>
        )}

        {userEmail && <Text style={styles.emailText}>{userEmail}</Text>}
        {profileDob ? <Text style={styles.dobText}>Born: {profileDob}</Text> : null}
        {profileMsg ? <Text style={[styles.profileMsg, profileMsg.includes('updated') && { color: C.steps }]}>{profileMsg}</Text> : null}

        <View style={styles.memberBadge}>
          <Ionicons name="shield-checkmark" size={12} color={C.steps} />
          <Text style={styles.memberBadgeText}>VitalWatch Member</Text>
        </View>
      </View>

      {/* Account Actions */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconBox}>
            <Ionicons name="person" size={16} color={C.primary} />
          </View>
          <Text style={styles.cardTitle}>Account</Text>
        </View>

        <Pressable onPress={() => setShowPasswordModal(true)} style={styles.actionRow}>
          <View style={[styles.prefIconBox, { backgroundColor: 'rgba(77,138,240,0.12)' }]}>
            <Ionicons name="lock-closed" size={14} color={C.primary} />
          </View>
          <Text style={styles.actionLabel}>Change Password</Text>
          <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
        </Pressable>

        <View style={styles.separator} />

        <Pressable onPress={() => setShowDeleteModal(true)} style={styles.actionRow}>
          <View style={[styles.prefIconBox, { backgroundColor: 'rgba(255,83,112,0.12)' }]}>
            <Ionicons name="trash" size={14} color={C.hr} />
          </View>
          <Text style={[styles.actionLabel, { color: C.hr }]}>Delete Account</Text>
          <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
        </Pressable>
      </View>

      {/* Step Goal */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIconBox, { backgroundColor: 'rgba(0,229,160,0.12)' }]}>
            <Ionicons name="footsteps" size={16} color={C.steps} />
          </View>
          <Text style={styles.cardTitle}>Daily Step Goal</Text>
        </View>
        {editingGoal ? (
          <View style={styles.goalEditRow}>
            <TextInput
              style={styles.goalInput}
              value={tempGoal}
              onChangeText={setTempGoal}
              keyboardType="number-pad"
              placeholder="10000"
              placeholderTextColor={C.textMuted}
              autoFocus
            />
            <Text style={styles.goalUnit}>steps</Text>
            <Pressable onPress={handleSaveGoal} style={styles.editSaveBtn}>
              <Ionicons name="checkmark" size={18} color={C.steps} />
            </Pressable>
            <Pressable onPress={() => { setEditingGoal(false); setTempGoal(String(stepGoal)); }} style={styles.editCancelBtn}>
              <Ionicons name="close" size={18} color={C.hr} />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setEditingGoal(true)} style={styles.goalRow}>
            <Text style={styles.goalValue}>{stepGoal.toLocaleString()}</Text>
            <Text style={styles.goalUnit}>steps / day</Text>
            <Ionicons name="pencil" size={14} color={C.textMuted} style={{ marginLeft: 'auto' }} />
          </Pressable>
        )}
        <View style={styles.goalPresets}>
          {[5000, 7500, 10000, 15000].map((g) => (
            <Pressable
              key={g}
              onPress={() => {
                setStepGoal(g); setTempGoal(String(g));
                if (typeof window !== 'undefined' && window.localStorage) localStorage.setItem('vw_step_goal', String(g));
              }}
              style={[styles.goalPresetChip, stepGoal === g && { backgroundColor: C.steps + '25', borderColor: C.steps + '50' }]}
            >
              <Text style={[styles.goalPresetText, stepGoal === g && { color: C.steps }]}>
                {(g / 1000).toFixed(g % 1000 ? 1 : 0)}k
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Appearance */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIconBox, { backgroundColor: 'rgba(90,127,191,0.12)' }]}>
            <Ionicons name={isDark ? 'moon' : 'sunny'} size={16} color={C.primary} />
          </View>
          <Text style={styles.cardTitle}>Appearance</Text>
        </View>
        <View style={styles.prefRow}>
          <View style={styles.prefInfo}>
            <View style={[styles.prefIconBox, { backgroundColor: isDark ? 'rgba(90,127,191,0.12)' : 'rgba(191,164,90,0.12)' }]}>
              <Ionicons name={isDark ? 'moon-outline' : 'sunny-outline'} size={14} color={isDark ? C.primary : C.gold} />
            </View>
            <View>
              <Text style={styles.prefLabel}>{isDark ? 'Dark Mode' : 'Light Mode'}</Text>
              <Text style={styles.prefSub}>Toggle theme</Text>
            </View>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: '#dde1e8', true: C.primary + '80' }}
            thumbColor={isDark ? C.primary : '#f0f2f5'}
          />
        </View>
      </View>

      {/* Notifications */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconBox}>
            <Ionicons name="notifications" size={16} color={C.alert} />
          </View>
          <Text style={styles.cardTitle}>Notifications</Text>
        </View>
        <View style={styles.prefRow}>
          <View style={styles.prefInfo}>
            <View style={[styles.prefIconBox, { backgroundColor: 'rgba(255,83,112,0.12)' }]}>
              <Ionicons name="heart" size={14} color={C.hr} />
            </View>
            <View>
              <Text style={styles.prefLabel}>Heart Rate Alerts</Text>
              <Text style={styles.prefSub}>When HR exceeds 85% of max</Text>
            </View>
          </View>
          <Switch
            value={enableHeartRateAlerts}
            onValueChange={(v) => updatePref('heartRate', v)}
            disabled={prefLoading}
            trackColor={{ false: '#1e3356', true: C.primary + '80' }}
            thumbColor={enableHeartRateAlerts ? C.primary : '#3d5478'}
          />
        </View>
        <View style={styles.separator} />
        <View style={styles.prefRow}>
          <View style={styles.prefInfo}>
            <View style={[styles.prefIconBox, { backgroundColor: 'rgba(255,176,32,0.12)' }]}>
              <Ionicons name="notifications" size={14} color={C.alert} />
            </View>
            <View>
              <Text style={styles.prefLabel}>General Alerts</Text>
              <Text style={styles.prefSub}>All other health notifications</Text>
            </View>
          </View>
          <Switch
            value={enableGeneralAlerts}
            onValueChange={(v) => updatePref('general', v)}
            disabled={prefLoading}
            trackColor={{ false: '#1e3356', true: C.primary + '80' }}
            thumbColor={enableGeneralAlerts ? C.primary : '#3d5478'}
          />
        </View>
      </View>

      {/* TinyML Status */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIconBox, { backgroundColor: 'rgba(166,127,250,0.12)' }]}>
            <Ionicons name="hardware-chip-outline" size={16} color="#8b7db8" />
          </View>
          <Text style={styles.cardTitle}>On-Device AI</Text>
          <View style={styles.mlBadge}><Text style={styles.mlBadgeText}>TinyML</Text></View>
        </View>
        {(() => {
          const status = getModelStatus();
          const pendingSync = getPendingSyncCount();
          const bl = computeLocalBaselines();
          return (
            <>
              <InfoRow label="Status" value={status.initialized ? 'Active' : 'Initializing...'} highlight={status.initialized} />
              <View style={styles.separator} />
              <InfoRow label="Models loaded" value={String(status.modelsLoaded.length)} />
              <View style={styles.separator} />
              <InfoRow label="Data buffer" value={`${status.bufferSize} readings`} />
              <View style={styles.separator} />
              <InfoRow label="Pending sync" value={`${pendingSync} readings`} />
              <View style={styles.separator} />
              <InfoRow label="Baselines" value={bl.isPersonalized ? 'Personalized' : `Learning ${bl.learningProgress}%`} highlight={bl.isPersonalized} />
              <View style={styles.separator} />
              <View style={styles.modelList}>
                {status.modelsLoaded.map((m) => (
                  <View key={m} style={styles.modelChip}>
                    <View style={styles.modelDot} />
                    <Text style={styles.modelChipText}>{m}</Text>
                  </View>
                ))}
              </View>
            </>
          );
        })()}
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <View style={styles.logoutInner}>
          <Ionicons name="log-out-outline" size={18} color={C.hr} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.versionFooter}>VitalWatch v1.0.0-beta.1</Text>

      {/* Password Change Modal */}
      <Modal visible={showPasswordModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <TextInput style={styles.modalInput} placeholder="Current password" placeholderTextColor={C.textMuted}
              secureTextEntry value={currentPw} onChangeText={setCurrentPw} />
            <TextInput style={styles.modalInput} placeholder="New password (min 6 chars)" placeholderTextColor={C.textMuted}
              secureTextEntry value={newPw} onChangeText={setNewPw} />
            <TextInput style={styles.modalInput} placeholder="Confirm new password" placeholderTextColor={C.textMuted}
              secureTextEntry value={confirmPw} onChangeText={setConfirmPw} />
            {pwMsg ? <Text style={[styles.modalMsg, pwMsg.includes('success') && { color: C.steps }]}>{pwMsg}</Text> : null}
            <View style={styles.modalBtns}>
              <Pressable onPress={() => { setShowPasswordModal(false); setPwMsg(''); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }}
                style={styles.modalCancelBtn}><Text style={styles.modalCancelText}>Cancel</Text></Pressable>
              <Pressable onPress={handleChangePassword} style={[styles.modalConfirmBtn, pwLoading && { opacity: 0.5 }]} disabled={pwLoading}>
                <Text style={styles.modalConfirmText}>{pwLoading ? 'Saving...' : 'Change Password'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Account Modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="warning" size={32} color={C.hr} style={{ alignSelf: 'center', marginBottom: 8 }} />
            <Text style={[styles.modalTitle, { color: C.hr }]}>Delete Account</Text>
            <Text style={styles.modalDesc}>This will permanently delete your account, all vitals, alerts, and health data. This cannot be undone.</Text>
            <TextInput style={styles.modalInput} placeholder="Enter your password to confirm" placeholderTextColor={C.textMuted}
              secureTextEntry value={deletePw} onChangeText={setDeletePw} />
            {deleteMsg ? <Text style={styles.modalMsg}>{deleteMsg}</Text> : null}
            <View style={styles.modalBtns}>
              <Pressable onPress={() => { setShowDeleteModal(false); setDeleteMsg(''); setDeletePw(''); }}
                style={styles.modalCancelBtn}><Text style={styles.modalCancelText}>Cancel</Text></Pressable>
              <Pressable onPress={handleDeleteAccount} style={[styles.modalConfirmBtn, { backgroundColor: 'rgba(255,83,112,0.15)' }]}>
                <Text style={[styles.modalConfirmText, { color: C.hr }]}>Delete Forever</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, highlight && { color: '#5ba88a' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, gap: 14, paddingBottom: 40 },

  avatarCard: {
    backgroundColor: C.card, borderRadius: 20, padding: 28, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: C.cardBorder,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
  },
  avatarCircle: { width: 88, height: 88, borderRadius: 44, borderWidth: 2.5, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  avatarInner: { width: 78, height: 78, borderRadius: 39, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 32, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  displayName: { fontSize: 20, fontWeight: '700', color: C.text },
  emailText: { fontSize: 13, color: C.textSub },
  dobText: { fontSize: 12, color: C.textMuted },
  profileMsg: { fontSize: 12, color: C.hr, marginTop: 2 },
  memberBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,229,160,0.10)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,229,160,0.25)', marginTop: 4,
  },
  memberBadgeText: { fontSize: 12, fontWeight: '600', color: C.steps },

  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editInput: {
    backgroundColor: C.bg, color: C.text, fontSize: 16, fontWeight: '600',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.primary, minWidth: 160,
  },
  editSaveBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(0,229,160,0.15)', justifyContent: 'center', alignItems: 'center' },
  editCancelBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,83,112,0.15)', justifyContent: 'center', alignItems: 'center' },

  card: {
    backgroundColor: C.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.cardBorder,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  cardIconBox: { width: 32, height: 32, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  actionLabel: { fontSize: 14, fontWeight: '600', color: C.text, flex: 1 },

  // Step goal
  goalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  goalEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goalValue: { fontSize: 28, fontWeight: '800', color: C.steps },
  goalUnit: { fontSize: 13, color: C.textMuted },
  goalInput: {
    backgroundColor: C.bg, color: C.steps, fontSize: 22, fontWeight: '800',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: C.steps, width: 120,
  },
  goalPresets: { flexDirection: 'row', gap: 8, marginTop: 12 },
  goalPresetChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bg,
  },
  goalPresetText: { fontSize: 12, fontWeight: '700', color: C.textMuted },

  prefRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  prefInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  prefIconBox: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  prefLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  prefSub: { fontSize: 11, color: C.textMuted, marginTop: 1 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 12 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  infoLabel: { fontSize: 14, color: C.textSub },
  infoValue: { fontSize: 14, fontWeight: '600', color: C.text },

  logoutBtn: {
    backgroundColor: 'rgba(255,83,112,0.08)', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,83,112,0.25)',
  },
  logoutInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logoutText: { color: C.hr, fontSize: 15, fontWeight: '700' },
  versionFooter: { textAlign: 'center', fontSize: 12, color: C.textMuted, marginTop: 4 },

  mlBadge: {
    marginLeft: 'auto' as any, backgroundColor: 'rgba(166,127,250,0.2)',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(166,127,250,0.4)',
  },
  mlBadgeText: { fontSize: 9, fontWeight: '800', color: '#8b7db8', letterSpacing: 0.8 },
  modelList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  modelChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,229,160,0.08)', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, borderColor: 'rgba(0,229,160,0.2)',
  },
  modelDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5ba88a' },
  modelChipText: { fontSize: 11, color: '#7a97c0', fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: {
    backgroundColor: C.card, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400,
    borderWidth: 1, borderColor: C.cardBorder,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 8 },
  modalDesc: { fontSize: 13, color: C.textSub, lineHeight: 20, marginBottom: 12 },
  modalInput: {
    backgroundColor: C.bg, color: C.text, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, marginBottom: 10,
  },
  modalMsg: { fontSize: 12, color: C.hr, marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: C.bg, alignItems: 'center' },
  modalCancelText: { color: C.textSub, fontWeight: '600' },
  modalConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(77,138,240,0.15)', alignItems: 'center' },
  modalConfirmText: { color: C.primary, fontWeight: '700' },
});
