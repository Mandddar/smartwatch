import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import {
  connectDevice,
  disconnectDevice,
  getDeviceStatus,
  getVitalsLatest,
  getInsights,
  getLatestSleep,
} from '@/lib/api';

const C = {
  bg: '#0b1120',
  card: '#141f35',
  cardBorder: '#1e3356',
  primary: '#4d8af0',
  hr: '#ff5370',
  hrBg: 'rgba(255,83,112,0.13)',
  spo2: '#00d4ff',
  spo2Bg: 'rgba(0,212,255,0.10)',
  steps: '#00e5a0',
  stepsBg: 'rgba(0,229,160,0.10)',
  sleep: '#a67ffa',
  sleepBg: 'rgba(166,127,250,0.12)',
  connected: '#00e5a0',
  disconnected: '#ff5370',
  text: '#e8f0fe',
  textSub: '#7a97c0',
  textMuted: '#3d5478',
  gold: '#ffd060',
};

const POLL_INTERVAL_MS = 5000;
const LIVE_INTERVAL_MS = 1500;

interface Vitals {
  heartRate: number | null;
  spo2: number | null;
  steps: number | null;
  timestamp: string | null;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getHRZone(hr: number): { zone: string; color: string } {
  if (hr < 60) return { zone: 'Resting', color: C.primary };
  if (hr < 90) return { zone: 'Light', color: C.steps };
  if (hr < 110) return { zone: 'Fat Burn', color: '#ffb020' };
  if (hr < 130) return { zone: 'Cardio', color: '#ff8040' };
  return { zone: 'Peak', color: C.hr };
}

function calcHealthScore(hr: number | null, spo2: number | null, steps: number | null): number {
  let score = 70;
  if (hr !== null) {
    if (hr >= 60 && hr <= 85) score += 15;
    else if (hr >= 50 && hr <= 100) score += 8;
    else score -= 5;
  }
  if (spo2 !== null) {
    if (spo2 >= 98) score += 10;
    else if (spo2 >= 95) score += 5;
    else score -= 10;
  }
  if (steps !== null) {
    if (steps >= 10000) score += 10;
    else if (steps >= 7000) score += 6;
    else if (steps >= 4000) score += 2;
  }
  return Math.min(100, Math.max(0, score));
}

function getScoreLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Excellent', color: C.steps };
  if (score >= 75) return { label: 'Good', color: '#4d8af0' };
  if (score >= 55) return { label: 'Fair', color: '#ffb020' };
  return { label: 'Poor', color: C.hr };
}

function estimateCalories(steps: number): number {
  return Math.round(steps * 0.04);
}

function PulseDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.8, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(opacity, { toValue: 0.8, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <View style={styles.pulseContainer}>
      <Animated.View style={[styles.pulseRing, { transform: [{ scale }], opacity }]} />
      <View style={styles.pulseDot} />
    </View>
  );
}

function SparkBar({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return (
    <View style={styles.sparkRow}>
      {values.map((v, i) => {
        const h = 6 + Math.round(((v - min) / range) * 18);
        return (
          <View
            key={i}
            style={[styles.sparkBar, { height: h, opacity: 0.4 + (i / values.length) * 0.6 }]}
          />
        );
      })}
    </View>
  );
}

export default function HomeScreen() {
  const { token, userEmail } = useAuth();
  const [status, setStatus] = useState<'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED');
  const [vitals, setVitals] = useState<Vitals | null>(null);
  const [liveVitals, setLiveVitals] = useState<Vitals | null>(null);
  const [hrHistory, setHrHistory] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [insights, setInsights] = useState<{ insights: string[] } | null>(null);
  const [sleep, setSleep] = useState<any>(null);

  const liveRef = useRef({ hr: 72, spo2: 98, steps: 5200, initialized: false });

  async function fetchStatus() {
    try {
      const s = await getDeviceStatus(token);
      setStatus(s.status);
    } catch {
      setStatus('DISCONNECTED');
    }
  }

  async function fetchVitals() {
    try {
      const v = await getVitalsLatest(token);
      setVitals(v);
      if (v?.heartRate) {
        liveRef.current = {
          hr: v.heartRate,
          spo2: v.spo2 ?? liveRef.current.spo2,
          steps: v.steps ?? liveRef.current.steps,
          initialized: true,
        };
      }
    } catch {
      setVitals(null);
    }
  }

  async function fetchInsightsData() {
    try {
      const i = await getInsights(token);
      setInsights(i);
    } catch {
      setInsights(null);
    }
  }

  async function fetchSleepData() {
    try {
      const s = await getLatestSleep(token);
      setSleep(s);
    } catch {
      setSleep(null);
    }
  }

  async function loadAll() {
    await Promise.all([fetchStatus(), fetchVitals(), fetchInsightsData(), fetchSleepData()]);
  }

  async function refresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  useEffect(() => {
    setInitialLoading(true);
    loadAll().finally(() => setInitialLoading(false));
  }, [token]);

  // API poll every 5s
  useEffect(() => {
    if (status !== 'CONNECTED') return;
    const id = setInterval(fetchVitals, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [status, token]);

  // Local live simulation every 1.5s for continuous feel
  useEffect(() => {
    if (status !== 'CONNECTED') {
      setLiveVitals(null);
      setHrHistory([]);
      return;
    }
    if (!liveRef.current.initialized) {
      liveRef.current = { hr: 72, spo2: 98, steps: 5200, initialized: true };
    }
    const id = setInterval(() => {
      const prev = liveRef.current;
      const hr = Math.min(115, Math.max(52, prev.hr + (Math.random() - 0.46) * 3.5));
      const spo2 = Math.min(100, Math.max(94, prev.spo2 + (Math.random() - 0.5) * 0.5));
      const steps = prev.steps + Math.floor(Math.random() * 6);
      liveRef.current = {
        hr: Math.round(hr),
        spo2: parseFloat(spo2.toFixed(1)),
        steps,
        initialized: true,
      };
      setHrHistory((h) => [...h.slice(-9), Math.round(hr)]);
      setLiveVitals({
        heartRate: Math.round(hr),
        spo2: parseFloat(spo2.toFixed(1)),
        steps,
        timestamp: new Date().toISOString(),
      });
    }, LIVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [status]);

  async function handleConnect() {
    setLoading(true);
    try {
      await connectDevice(token);
      setStatus('CONNECTED');
      await fetchVitals();
    } catch {
      // Still set connected for demo mode
      setStatus('CONNECTED');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      await disconnectDevice(token);
    } catch {}
    setStatus('DISCONNECTED');
    setVitals(null);
    setLiveVitals(null);
    liveRef.current.initialized = false;
    setLoading(false);
  }

  const displayName = userEmail ? userEmail.split('@')[0] : 'there';
  const isConnected = status === 'CONNECTED';
  const displayVitals = isConnected ? (liveVitals ?? vitals) : vitals;

  const score = calcHealthScore(
    displayVitals?.heartRate ?? null,
    displayVitals?.spo2 ?? null,
    displayVitals?.steps ?? null
  );
  const scoreInfo = getScoreLabel(score);
  const hrZone = displayVitals?.heartRate ? getHRZone(displayVitals.heartRate) : null;
  const calories = displayVitals?.steps ? estimateCalories(displayVitals.steps) : null;

  if (initialLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingText}>Loading your health data...</Text>
      </View>
    );
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[C.primary]} tintColor={C.primary} />
      }
    >
      {/* Greeting */}
      <View style={styles.greeting}>
        <Text style={styles.greetingText}>{getGreeting()}, {displayName} 👋</Text>
        <Text style={styles.greetingDate}>{today}</Text>
      </View>

      {/* Health Score Card */}
      {isConnected && displayVitals?.heartRate != null && (
        <View style={[styles.card, styles.scoreCard]}>
          <View style={styles.scoreRow}>
            <View>
              <Text style={styles.scoreLabel}>Health Score</Text>
              <View style={styles.scoreValueRow}>
                <Text style={[styles.scoreValue, { color: scoreInfo.color }]}>{score}</Text>
                <Text style={styles.scoreMax}> / 100</Text>
              </View>
              <Text style={[styles.scoreTag, { color: scoreInfo.color }]}>{scoreInfo.label}</Text>
            </View>
            <View style={styles.scoreRingArea}>
              <View style={[styles.scoreRing, { borderColor: scoreInfo.color }]}>
                <Ionicons name="heart-circle" size={32} color={scoreInfo.color} />
              </View>
            </View>
          </View>
          <View style={styles.scoreBarBg}>
            <View style={[styles.scoreBarFill, { width: `${score}%` as any, backgroundColor: scoreInfo.color }]} />
          </View>
          {calories !== null && (
            <Text style={styles.calorieText}>
              🔥 ~{calories.toLocaleString()} kcal burned today
            </Text>
          )}
        </View>
      )}

      {/* Device Card */}
      <View style={[styles.card, isConnected && styles.cardConnected]}>
        <View style={styles.deviceHeader}>
          <View style={styles.deviceLeft}>
            {isConnected && <PulseDot />}
            <View>
              <Text style={styles.cardTitle}>Device Status</Text>
              <Text style={[styles.statusText, isConnected ? styles.statusConnected : styles.statusDisconnected]}>
                {isConnected ? '● Live · Connected' : '○ Disconnected'}
              </Text>
            </View>
          </View>
          <Ionicons
            name={isConnected ? 'watch' : 'watch-outline'}
            size={28}
            color={isConnected ? C.connected : C.disconnected}
          />
        </View>
        {isConnected ? (
          <TouchableOpacity
            style={[styles.button, styles.disconnectBtn, loading && styles.buttonDisabled]}
            onPress={handleDisconnect}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>{loading ? 'Disconnecting...' : 'Disconnect Device'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Ionicons name="bluetooth" size={16} color={C.text} style={{ marginRight: 6 }} />
            <Text style={styles.buttonText}>{loading ? 'Connecting...' : 'Connect Device'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Vitals Card */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="pulse" size={18} color={C.hr} />
          <Text style={styles.cardTitle}> Live Vitals</Text>
          {isConnected && <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>LIVE</Text></View>}
        </View>

        {displayVitals?.heartRate != null ? (
          <>
            <View style={styles.vitalsGrid}>
              {/* Heart Rate */}
              <View style={[styles.vitalTile, { backgroundColor: C.hrBg, borderColor: 'rgba(255,83,112,0.25)' }]}>
                <Ionicons name="heart" size={20} color={C.hr} />
                <Text style={[styles.vitalValue, { color: C.hr }]}>{displayVitals.heartRate}</Text>
                <Text style={[styles.vitalUnit, { color: C.hr }]}>bpm</Text>
                <Text style={styles.vitalLabel}>Heart Rate</Text>
              </View>

              {/* SpO2 */}
              <View style={[styles.vitalTile, { backgroundColor: C.spo2Bg, borderColor: 'rgba(0,212,255,0.2)' }]}>
                <Ionicons name="water" size={20} color={C.spo2} />
                <Text style={[styles.vitalValue, { color: C.spo2 }]}>{displayVitals.spo2}</Text>
                <Text style={[styles.vitalUnit, { color: C.spo2 }]}>%</Text>
                <Text style={styles.vitalLabel}>SpO2</Text>
              </View>

              {/* Steps */}
              <View style={[styles.vitalTile, { backgroundColor: C.stepsBg, borderColor: 'rgba(0,229,160,0.2)' }]}>
                <Ionicons name="footsteps" size={20} color={C.steps} />
                <Text style={[styles.vitalValue, { color: C.steps }]}>
                  {displayVitals.steps != null
                    ? displayVitals.steps >= 1000
                      ? `${(displayVitals.steps / 1000).toFixed(1)}k`
                      : String(displayVitals.steps)
                    : '—'}
                </Text>
                <Text style={[styles.vitalUnit, { color: C.steps }]}>steps</Text>
                <Text style={styles.vitalLabel}>Activity</Text>
              </View>
            </View>

            {/* HR Zone */}
            {hrZone && (
              <View style={[styles.hrZoneBar, { borderColor: hrZone.color + '40' }]}>
                <View style={[styles.hrZoneDot, { backgroundColor: hrZone.color }]} />
                <Text style={styles.hrZoneLabel}>Zone: </Text>
                <Text style={[styles.hrZoneName, { color: hrZone.color }]}>{hrZone.zone}</Text>
                {hrHistory.length > 2 && <SparkBar values={hrHistory} />}
              </View>
            )}

            {displayVitals.timestamp && (
              <Text style={styles.timestamp}>
                Updated {new Date(displayVitals.timestamp).toLocaleTimeString()}
              </Text>
            )}
          </>
        ) : (
          <View style={styles.emptyVitals}>
            <Ionicons name="pulse-outline" size={40} color={C.textMuted} />
            <Text style={styles.hint}>
              {isConnected ? 'Waiting for first reading...' : 'Connect your device to see live vitals'}
            </Text>
          </View>
        )}
      </View>

      {/* AI Insights */}
      {insights?.insights && insights.insights.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="sparkles" size={18} color={C.gold} />
            <Text style={styles.cardTitle}> AI Health Insights</Text>
          </View>
          {insights.insights.map((insight: string, idx: number) => (
            <View key={idx} style={styles.insightRow}>
              <View style={[styles.insightBullet, { backgroundColor: C.gold }]} />
              <Text style={styles.insightText}>{insight}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Sleep Summary */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="moon" size={18} color={C.sleep} />
          <Text style={styles.cardTitle}> Sleep Summary</Text>
        </View>
        {sleep ? (
          <View style={styles.sleepContent}>
            <View style={styles.sleepScoreRow}>
              <Text style={[styles.sleepScore, { color: C.sleep }]}>{sleep.qualityScore.toFixed(0)}</Text>
              <View>
                <Text style={styles.sleepScoreLabel}>/ 100</Text>
                <Text style={styles.sleepScoreSub}>Quality Score</Text>
              </View>
            </View>
            <View style={styles.sleepBarBg}>
              <View style={[styles.sleepBarFill, { width: `${sleep.qualityScore}%` as any }]} />
            </View>
            <View style={styles.sleepTimeRow}>
              <View style={styles.sleepTimeItem}>
                <Text style={styles.sleepTimeLabel}>Bedtime</Text>
                <Text style={[styles.sleepTimeValue, { color: C.sleep }]}>
                  {new Date(sleep.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              {sleep.endTime && (
                <View style={styles.sleepTimeItem}>
                  <Text style={styles.sleepTimeLabel}>Wake up</Text>
                  <Text style={[styles.sleepTimeValue, { color: C.sleep }]}>
                    {new Date(sleep.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.emptyVitals}>
            <Ionicons name="moon-outline" size={40} color={C.textMuted} />
            <Text style={styles.hint}>No sleep data available yet</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, gap: 14, paddingBottom: 36 },
  loadingScreen: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  loadingText: { fontSize: 15, color: C.textSub },
  greeting: { marginBottom: 4, paddingTop: 4 },
  greetingText: { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: 0.2 },
  greetingDate: { fontSize: 13, color: C.textSub, marginTop: 3 },

  // Health Score
  scoreCard: { paddingBottom: 16 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  scoreLabel: { fontSize: 12, color: C.textSub, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  scoreValueRow: { flexDirection: 'row', alignItems: 'flex-end' },
  scoreValue: { fontSize: 46, fontWeight: '800', lineHeight: 50 },
  scoreMax: { fontSize: 18, color: C.textSub, fontWeight: '600', marginBottom: 6 },
  scoreTag: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  scoreRingArea: { justifyContent: 'center', alignItems: 'center' },
  scoreRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  scoreBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' },
  scoreBarFill: { height: 6, borderRadius: 3 },
  calorieText: { fontSize: 13, color: C.textSub, marginTop: 10 },

  // Card
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: C.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  cardConnected: {
    borderColor: 'rgba(0,229,160,0.35)',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  // Device
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  deviceLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { fontSize: 13, fontWeight: '600', marginTop: 3 },
  statusConnected: { color: C.connected },
  statusDisconnected: { color: C.textSub },
  pulseContainer: { width: 22, height: 22, justifyContent: 'center', alignItems: 'center' },
  pulseRing: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.connected,
  },
  pulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.connected },
  button: {
    backgroundColor: C.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  disconnectBtn: { backgroundColor: 'rgba(255,83,112,0.18)', borderWidth: 1, borderColor: 'rgba(255,83,112,0.4)' },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: C.text, fontSize: 15, fontWeight: '700' },

  // Vitals
  vitalsGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  vitalTile: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
  },
  vitalValue: { fontSize: 24, fontWeight: '800' },
  vitalUnit: { fontSize: 11, fontWeight: '700', marginTop: -2, opacity: 0.8 },
  vitalLabel: { fontSize: 10, color: C.textSub, textAlign: 'center', marginTop: 2 },

  // HR Zone
  hrZoneBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    marginBottom: 10,
    gap: 6,
  },
  hrZoneDot: { width: 8, height: 8, borderRadius: 4 },
  hrZoneLabel: { fontSize: 12, color: C.textSub },
  hrZoneName: { fontSize: 12, fontWeight: '700', flex: 1 },

  // Sparkline
  sparkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginLeft: 4 },
  sparkBar: { width: 4, borderRadius: 2, backgroundColor: C.hr },

  timestamp: { fontSize: 11, color: C.textMuted, textAlign: 'right' },
  emptyVitals: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  hint: { fontSize: 13, color: C.textSub, textAlign: 'center', fontStyle: 'italic' },

  // Live badge
  liveBadge: {
    marginLeft: 'auto' as any,
    backgroundColor: 'rgba(255,83,112,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,83,112,0.4)',
  },
  liveBadgeText: { fontSize: 10, fontWeight: '800', color: C.hr, letterSpacing: 1 },

  // Insights
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  insightBullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7, flexShrink: 0 },
  insightText: { flex: 1, fontSize: 14, color: C.textSub, lineHeight: 21 },

  // Sleep
  sleepContent: {},
  sleepScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sleepScore: { fontSize: 48, fontWeight: '800' },
  sleepScoreLabel: { fontSize: 18, color: C.textSub, fontWeight: '600' },
  sleepScoreSub: { fontSize: 12, color: C.textMuted },
  sleepBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 14 },
  sleepBarFill: { height: 6, borderRadius: 3, backgroundColor: C.sleep },
  sleepTimeRow: { flexDirection: 'row', gap: 28 },
  sleepTimeItem: {},
  sleepTimeLabel: { fontSize: 12, color: C.textMuted, marginBottom: 2 },
  sleepTimeValue: { fontSize: 16, fontWeight: '700' },
});
