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
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { getPreferences, updatePreferences } from '@/lib/api';

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: onConfirm },
    ]);
  }
}

const C = {
  bg: '#0b1120',
  card: '#141f35',
  cardBorder: '#1e3356',
  primary: '#4d8af0',
  hr: '#ff5370',
  steps: '#00e5a0',
  sleep: '#a67ffa',
  alert: '#ffb020',
  text: '#e8f0fe',
  textSub: '#7a97c0',
  textMuted: '#3d5478',
};

const AVATAR_COLORS = [
  '#4d8af0', '#ff5370', '#00e5a0', '#a67ffa', '#ffb020', '#00d4ff',
];

function getAvatarColor(name: string): string {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export default function ProfileScreen() {
  const { token, userEmail, setAuth } = useAuth();
  const [enableHeartRateAlerts, setEnableHeartRateAlerts] = useState(true);
  const [enableGeneralAlerts, setEnableGeneralAlerts] = useState(true);
  const [prefLoading, setPrefLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    getPreferences(token).then((p) => {
      setEnableHeartRateAlerts(p.enableHeartRateAlerts);
      setEnableGeneralAlerts(p.enableGeneralAlerts);
    }).catch(() => {});
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
      Alert.alert('Error', (e as Error).message);
    } finally {
      setPrefLoading(false);
    }
  }

  function handleLogout() {
    confirmAction('Sign Out', 'Are you sure you want to sign out?', async () => {
      await setAuth(null, null);
      router.replace('/(auth)/login');
    });
  }

  const displayName = userEmail
    ? userEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'User';

  const avatarColor = getAvatarColor(displayName);
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Avatar Card */}
      <View style={styles.avatarCard}>
        <View style={[styles.avatarCircle, { borderColor: avatarColor + '60' }]}>
          <View style={[styles.avatarInner, { backgroundColor: avatarColor + '25' }]}>
            <Text style={[styles.avatarInitial, { color: avatarColor }]}>{initials}</Text>
          </View>
        </View>
        <Text style={styles.displayName}>{displayName}</Text>
        {userEmail && <Text style={styles.emailText}>{userEmail}</Text>}
        <View style={styles.memberBadge}>
          <Ionicons name="shield-checkmark" size={12} color={C.steps} />
          <Text style={styles.memberBadgeText}>VitalWatch Member</Text>
        </View>
      </View>

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderColor: 'rgba(255,83,112,0.25)' }]}>
          <Ionicons name="heart" size={20} color={C.hr} />
          <Text style={[styles.statValue, { color: C.hr }]}>5s</Text>
          <Text style={styles.statLabel}>Refresh Rate</Text>
        </View>
        <View style={[styles.statCard, { borderColor: 'rgba(0,229,160,0.25)' }]}>
          <Ionicons name="shield-checkmark" size={20} color={C.steps} />
          <Text style={[styles.statValue, { color: C.steps }]}>JWT</Text>
          <Text style={styles.statLabel}>Auth Type</Text>
        </View>
        <View style={[styles.statCard, { borderColor: 'rgba(77,138,240,0.25)' }]}>
          <Ionicons name="cloud-done" size={20} color={C.primary} />
          <Text style={[styles.statValue, { color: C.primary }]}>Sync</Text>
          <Text style={styles.statLabel}>Status</Text>
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
            ios_backgroundColor="#1e3356"
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
            ios_backgroundColor="#1e3356"
          />
        </View>
      </View>

      {/* App Info */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconBox}>
            <Ionicons name="information-circle" size={16} color={C.primary} />
          </View>
          <Text style={styles.cardTitle}>About</Text>
        </View>
        <InfoRow label="App" value="VitalWatch" />
        <View style={styles.separator} />
        <InfoRow label="Version" value="1.0.0" />
        <View style={styles.separator} />
        <InfoRow label="Data refresh" value="Every 5 seconds" />
        <View style={styles.separator} />
        <InfoRow label="Live simulation" value="Every 1.5 seconds" highlight />
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <View style={styles.logoutInner}>
          <Ionicons name="log-out-outline" size={18} color={C.hr} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.versionFooter}>VitalWatch v1.0.0 · Made with ❤️</Text>
    </ScrollView>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, highlight && { color: '#00e5a0' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, gap: 14, paddingBottom: 40 },

  // Avatar
  avatarCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: C.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarInner: {
    width: 78,
    height: 78,
    borderRadius: 39,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { fontSize: 32, fontWeight: '800' },
  displayName: { fontSize: 20, fontWeight: '700', color: C.text },
  emailText: { fontSize: 13, color: C.textSub },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,229,160,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,229,160,0.25)',
    marginTop: 4,
  },
  memberBadgeText: { fontSize: 12, fontWeight: '600', color: C.steps },

  // Stats row
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
  },
  statValue: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 10, color: C.textMuted, textAlign: 'center' },

  // Card
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: C.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  cardIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },

  // Prefs
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  prefInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  prefIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  prefLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  prefSub: { fontSize: 11, color: C.textMuted, marginTop: 1 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 12 },

  // Info
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  infoLabel: { fontSize: 14, color: C.textSub },
  infoValue: { fontSize: 14, fontWeight: '600', color: C.text },

  // Logout
  logoutBtn: {
    backgroundColor: 'rgba(255,83,112,0.08)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,83,112,0.25)',
  },
  logoutInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logoutText: { color: C.hr, fontSize: 15, fontWeight: '700' },

  versionFooter: { textAlign: 'center', fontSize: 12, color: C.textMuted, marginTop: 4 },
});
