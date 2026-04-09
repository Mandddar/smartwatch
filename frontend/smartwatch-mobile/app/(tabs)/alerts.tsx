import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Alert as RNAlert,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import {
  getAlerts,
  markAlertAsRead,
  markAllAlertsRead,
  deleteAlert as apiDeleteAlert,
  getUnreadAlertCount,
} from '@/lib/api';
import { detectAnomaly } from '@/lib/ml/models/heartRateAnomaly';
import { hasEnoughData } from '@/lib/ml/vitalsBuffer';

const C = {
  bg: '#0b1120',
  card: '#141f35',
  cardBorder: '#1e3356',
  primary: '#5a7fbf',
  text: '#e8f0fe',
  textSub: '#7a97c0',
  textMuted: '#3d5478',
  steps: '#5ba88a',
  hr: '#c75e6b',
};

type Severity = 'LOW' | 'MEDIUM' | 'CRITICAL';
type FilterType = 'all' | 'unread' | 'LOW' | 'MEDIUM' | 'CRITICAL';

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
  LOW: { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.30)', icon: 'alert-circle-outline', label: 'LOW' },
  MEDIUM: { color: '#fb923c', bg: 'rgba(251,146,60,0.10)', border: 'rgba(251,146,60,0.30)', icon: 'warning-outline', label: 'MEDIUM' },
  CRITICAL: { color: '#c75e6b', bg: 'rgba(199,94,107,0.10)', border: 'rgba(199,94,107,0.30)', icon: 'alert', label: 'CRITICAL' },
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

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Skeleton loader
function SkeletonCard() {
  return (
    <View style={[styles.card, { borderColor: C.cardBorder, opacity: 0.5 }]}>
      <View style={styles.cardLeft}>
        <View style={[styles.iconCircle, { backgroundColor: C.cardBorder, borderColor: C.cardBorder }]} />
      </View>
      <View style={styles.cardBody}>
        <View style={{ height: 14, width: 80, backgroundColor: C.cardBorder, borderRadius: 6, marginBottom: 10 }} />
        <View style={{ height: 12, width: '90%', backgroundColor: C.cardBorder, borderRadius: 4, marginBottom: 6 }} />
        <View style={{ height: 12, width: '60%', backgroundColor: C.cardBorder, borderRadius: 4 }} />
      </View>
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
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await getAlerts(token);
      setAlerts(data);
    } catch {
      setAlerts([]);
    }
    if (hasEnoughData()) {
      try {
        const result = await detectAnomaly();
        if (result.anomalyDetected && result.message) {
          setMlAlerts([{
            id: 'ml-anomaly-current',
            message: result.message,
            timestamp: new Date().toISOString(),
            severity: result.anomalyScore > 0.8 ? 'CRITICAL' : result.anomalyScore > 0.6 ? 'MEDIUM' : 'LOW',
            isML: true,
          }]);
        } else {
          setMlAlerts([]);
        }
      } catch {}
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    fetchAlerts().finally(() => setLoading(false));
  }, [fetchAlerts]);

  async function onRefresh() {
    setRefreshing(true);
    await fetchAlerts();
    setRefreshing(false);
  }

  async function handleMarkRead(id: number) {
    try {
      await markAlertAsRead(token, id);
      setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, read: true } : a));
    } catch {}
  }

  async function handleMarkAllRead() {
    try {
      await markAllAlertsRead(token);
      setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    } catch {}
  }

  async function handleDelete(id: number) {
    const doDelete = () => {
      apiDeleteAlert(token, id).then(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
        setExpandedId(null);
      }).catch(() => {});
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this alert?')) doDelete();
    } else {
      RNAlert.alert('Delete Alert', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }

  const unreadCount = alerts.filter((a) => !a.read).length;
  const criticalCount = alerts.filter((a) => a.severity === 'CRITICAL').length;

  const filtered = alerts.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !a.read;
    return a.severity === filter;
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerBar}>
          <View style={{ height: 14, width: 100, backgroundColor: C.cardBorder, borderRadius: 6 }} />
        </View>
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with counts + mark all read */}
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
              <Text style={[styles.unreadPillText, { color: C.hr }]}>{criticalCount} critical</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 && (
          <Pressable onPress={handleMarkAllRead} style={styles.markAllBtn}>
            <Ionicons name="checkmark-done" size={14} color={C.primary} />
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {(['all', 'unread', 'CRITICAL', 'MEDIUM', 'LOW'] as FilterType[]).map((f) => {
          const active = filter === f;
          const label = f === 'all' ? 'All' : f === 'unread' ? 'Unread' : f;
          const chipColor = f === 'CRITICAL' ? C.hr : f === 'MEDIUM' ? '#fb923c' : f === 'LOW' ? '#fbbf24' : C.primary;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, active && { backgroundColor: chipColor + '25', borderColor: chipColor + '50' }]}
            >
              <Text style={[styles.filterChipText, active && { color: chipColor }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* ML Alerts */}
      {mlAlerts.length > 0 && (
        <View style={styles.mlSection}>
          {mlAlerts.map((a) => {
            const cfg = SEVERITY_CONFIG[a.severity] ?? SEVERITY_CONFIG.LOW;
            return (
              <View key={a.id} style={[styles.card, { borderColor: cfg.border, backgroundColor: cfg.bg }]}>
                <View style={styles.cardLeft}>
                  <View style={[styles.iconCircle, { backgroundColor: 'rgba(139,125,184,0.15)', borderColor: 'rgba(139,125,184,0.35)' }]}>
                    <Ionicons name="hardware-chip-outline" size={22} color="#8b7db8" />
                  </View>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardTitleRow}>
                    <View style={styles.mlBadge}>
                      <Text style={styles.mlBadgeText}>ON-DEVICE AI</Text>
                    </View>
                    <Text style={styles.timestamp}>{relativeTime(a.timestamp)}</Text>
                  </View>
                  <Text style={styles.message}>{a.message}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} tintColor={C.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconWrapper}>
              <Ionicons name={filter !== 'all' ? 'filter-outline' : 'checkmark-circle'} size={48} color={filter !== 'all' ? C.primary : C.steps} />
            </View>
            <Text style={styles.emptyTitle}>
              {filter !== 'all' ? 'No matching alerts' : 'All clear!'}
            </Text>
            <Text style={styles.emptyHint}>
              {filter !== 'all'
                ? `No ${filter === 'unread' ? 'unread' : filter.toLowerCase()} alerts found. Try a different filter.`
                : 'No health alerts yet. Alerts are triggered when your heart rate exceeds safe thresholds for sustained periods. Connect your device and start monitoring.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const severity = (item.severity as Severity) ?? 'LOW';
          const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.LOW;
          const isExpanded = expandedId === item.id;

          return (
            <Pressable
              onPress={() => {
                setExpandedId(isExpanded ? null : item.id);
                if (!item.read) handleMarkRead(item.id);
              }}
              style={({ pressed }) => [
                styles.card,
                { borderColor: item.read ? C.cardBorder : cfg.border },
                !item.read && { backgroundColor: cfg.bg },
                pressed && { opacity: 0.8 },
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
                  <Text style={styles.timestamp}>{relativeTime(item.timestamp)}</Text>
                </View>
                <Text style={styles.message}>{item.message}</Text>

                {/* Expanded actions */}
                {isExpanded && (
                  <View style={styles.actions}>
                    <Text style={styles.fullTimestamp}>
                      {new Date(item.timestamp).toLocaleString(undefined, {
                        weekday: 'short', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                    </Text>
                    <View style={styles.actionBtns}>
                      {!item.read && (
                        <Pressable onPress={() => handleMarkRead(item.id)} style={styles.actionBtn}>
                          <Ionicons name="checkmark-circle-outline" size={16} color={C.steps} />
                          <Text style={[styles.actionText, { color: C.steps }]}>Mark read</Text>
                        </Pressable>
                      )}
                      <Pressable onPress={() => handleDelete(item.id)} style={styles.actionBtn}>
                        <Ionicons name="trash-outline" size={16} color={C.hr} />
                        <Text style={[styles.actionText, { color: C.hr }]}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  headerBar: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    backgroundColor: 'rgba(199,94,107,0.10)',
    borderColor: 'rgba(199,94,107,0.3)',
  },
  unreadPillText: { fontSize: 11, fontWeight: '700', color: C.primary },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(77,138,240,0.10)',
  },
  markAllText: { fontSize: 12, fontWeight: '600', color: C.primary },

  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 8,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.card,
  },
  filterChipText: { fontSize: 11, fontWeight: '700', color: C.textMuted },

  list: { padding: 18, paddingTop: 4, gap: 12, flexGrow: 1 },
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
  unreadDot: { width: 7, height: 7, borderRadius: 4 },
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

  actions: { marginTop: 10, borderTopWidth: 1, borderTopColor: C.cardBorder, paddingTop: 10, gap: 8 },
  fullTimestamp: { fontSize: 11, color: C.textMuted },
  actionBtns: { flexDirection: 'row', gap: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  actionText: { fontSize: 12, fontWeight: '600' },

  empty: { flex: 1, paddingTop: 80, alignItems: 'center', paddingHorizontal: 32, gap: 12 },
  emptyIconWrapper: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(91,168,138,0.12)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4, borderWidth: 1, borderColor: 'rgba(91,168,138,0.25)',
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: C.steps },
  emptyHint: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 21 },

  mlSection: { paddingHorizontal: 18, paddingTop: 8, gap: 10 },
  mlBadge: {
    backgroundColor: 'rgba(139,125,184,0.2)',
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 5, borderWidth: 1, borderColor: 'rgba(139,125,184,0.4)',
  },
  mlBadgeText: { fontSize: 9, fontWeight: '800', color: '#8b7db8', letterSpacing: 0.8 },
});
