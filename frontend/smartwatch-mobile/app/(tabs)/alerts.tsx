import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { getAlerts } from '@/lib/api';
import { detectAnomaly } from '@/lib/ml/models/heartRateAnomaly';
import { hasEnoughData } from '@/lib/ml/vitalsBuffer';

const C = {
  bg: '#0b1120',
  card: '#141f35',
  cardBorder: '#1e3356',
  primary: '#4d8af0',
  text: '#e8f0fe',
  textSub: '#7a97c0',
  textMuted: '#3d5478',
  steps: '#00e5a0',
};

type Severity = 'LOW' | 'MEDIUM' | 'CRITICAL';

interface AlertItem {
  id: number;
  message: string;
  timestamp: string;
  read: boolean;
  severity: Severity;
}

const SEVERITY_CONFIG: Record<Severity, {
  color: string;
  bg: string;
  border: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
}> = {
  LOW: {
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.10)',
    border: 'rgba(251,191,36,0.30)',
    icon: 'alert-circle-outline',
    label: 'LOW',
  },
  MEDIUM: {
    color: '#fb923c',
    bg: 'rgba(251,146,60,0.10)',
    border: 'rgba(251,146,60,0.30)',
    icon: 'warning-outline',
    label: 'MEDIUM',
  },
  CRITICAL: {
    color: '#ff5370',
    bg: 'rgba(255,83,112,0.10)',
    border: 'rgba(255,83,112,0.30)',
    icon: 'alert',
    label: 'CRITICAL',
  },
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.LOW;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Ionicons name={cfg.icon} size={11} color={cfg.color} />
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

interface MLAlert {
  id: string;
  message: string;
  timestamp: string;
  severity: Severity;
  isML: true;
}

export default function AlertsScreen() {
  const { token } = useAuth();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [mlAlerts, setMlAlerts] = useState<MLAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchAlerts() {
    try {
      const data = await getAlerts(token);
      setAlerts(data);
    } catch {
      setAlerts([]);
    }
    // Check for ML anomalies
    if (hasEnoughData()) {
      try {
        const result = await detectAnomaly();
        if (result.anomalyDetected && result.anomalyMessage) {
          setMlAlerts([{
            id: `ml-${Date.now()}`,
            message: result.anomalyMessage,
            timestamp: new Date().toISOString(),
            severity: result.anomalyScore > 0.8 ? 'CRITICAL' : result.anomalyScore > 0.6 ? 'MEDIUM' : 'LOW',
            isML: true,
          }]);
        } else {
          setMlAlerts([]);
        }
      } catch {}
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchAlerts().finally(() => setLoading(false));
  }, [token]);

  async function onRefresh() {
    setRefreshing(true);
    await fetchAlerts();
    setRefreshing(false);
  }

  const unreadCount = alerts.filter((a) => !a.read).length;
  const criticalCount = alerts.filter((a) => a.severity === 'CRITICAL').length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingText}>Loading alerts...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {alerts.length > 0 && (
        <View style={styles.headerBar}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerCount}>
              {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
            </Text>
            {unreadCount > 0 && (
              <View style={styles.unreadPill}>
                <Text style={styles.unreadPillText}>{unreadCount} unread</Text>
              </View>
            )}
            {criticalCount > 0 && (
              <View style={[styles.unreadPill, styles.criticalPill]}>
                <Text style={[styles.unreadPillText, { color: '#ff5370' }]}>{criticalCount} critical</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ML Alerts */}
      {mlAlerts.length > 0 && (
        <View style={styles.mlSection}>
          {mlAlerts.map((a) => {
            const cfg = SEVERITY_CONFIG[a.severity] ?? SEVERITY_CONFIG.LOW;
            return (
              <View key={a.id} style={[styles.card, { borderColor: cfg.border, backgroundColor: cfg.bg }]}>
                <View style={styles.cardLeft}>
                  <View style={[styles.iconCircle, { backgroundColor: 'rgba(166,127,250,0.15)', borderColor: 'rgba(166,127,250,0.35)' }]}>
                    <Ionicons name="hardware-chip-outline" size={22} color="#a67ffa" />
                  </View>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardTitleRow}>
                    <View style={styles.mlBadge}>
                      <Text style={styles.mlBadgeText}>ON-DEVICE AI</Text>
                    </View>
                    <Text style={styles.timestamp}>
                      {new Date(a.timestamp).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Text style={styles.message}>{a.message}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <FlatList
        data={alerts}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} tintColor={C.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconWrapper}>
              <Ionicons name="checkmark-circle" size={48} color={C.steps} />
            </View>
            <Text style={styles.emptyTitle}>All clear!</Text>
            <Text style={styles.emptyHint}>
              No health alerts. Alerts fire when your heart rate exceeds 85% of your age-based maximum.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const severity = (item.severity as Severity) ?? 'LOW';
          const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.LOW;
          return (
            <View
              style={[
                styles.card,
                { borderColor: item.read ? C.cardBorder : cfg.border },
                !item.read && { backgroundColor: cfg.bg },
              ]}
            >
              <View style={styles.cardLeft}>
                <View style={[styles.iconCircle, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                  <Ionicons name={cfg.icon} size={22} color={cfg.color} />
                </View>
                {!item.read && <View style={[styles.unreadDot, { backgroundColor: cfg.color }]} />}
              </View>

              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <SeverityBadge severity={severity} />
                  <Text style={styles.timestamp}>
                    {new Date(item.timestamp).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text style={styles.message}>{item.message}</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: { fontSize: 15, color: C.textSub },
  headerBar: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 6,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerCount: { fontSize: 13, color: C.textSub, fontWeight: '600' },
  unreadPill: {
    backgroundColor: 'rgba(77,138,240,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(77,138,240,0.3)',
  },
  criticalPill: {
    backgroundColor: 'rgba(255,83,112,0.10)',
    borderColor: 'rgba(255,83,112,0.3)',
  },
  unreadPillText: { fontSize: 11, fontWeight: '700', color: C.primary },
  list: { padding: 18, paddingTop: 8, gap: 12, flexGrow: 1 },

  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  cardLeft: { alignItems: 'center', gap: 6 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  cardBody: { flex: 1 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  message: { fontSize: 14, color: C.textSub, lineHeight: 20 },
  timestamp: { fontSize: 11, color: C.textMuted },

  empty: {
    flex: 1,
    paddingTop: 80,
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIconWrapper: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(0,229,160,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,229,160,0.25)',
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: C.steps },
  emptyHint: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 21 },

  // ML Alerts
  mlSection: { paddingHorizontal: 18, paddingTop: 8, gap: 10 },
  mlBadge: {
    backgroundColor: 'rgba(166,127,250,0.2)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(166,127,250,0.4)',
  },
  mlBadgeText: { fontSize: 9, fontWeight: '800', color: '#a67ffa', letterSpacing: 0.8 },
});
