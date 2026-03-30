import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
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
  getLatestSleep,
} from '@/lib/api';
import { insertVital, getUnsyncedCount } from '@/lib/sync/localDb';
import { syncNow } from '@/lib/sync/syncService';
import { addReading, runInference, getModelStatus, type MLInsights } from '@/lib/ml';
import { computeLocalBaselines, describeDeviation, type AllBaselines } from '@/lib/ml/baselines';
import {
  initHealthConnect,
  isHealthConnectAvailable,
  requestPermissions as requestHCPermissions,
  startPolling as startHCPolling,
  stopPolling as stopHCPolling,
  pollLatestData,
  isPolling as isHCPolling,
  getSourceName,
} from '@/lib/health/healthConnect';

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

function getHRZone(hr: number): { zone: string; color: string; pct: number } {
  if (hr < 60) return { zone: 'Resting', color: C.primary, pct: 20 };
  if (hr < 90) return { zone: 'Light', color: C.steps, pct: 40 };
  if (hr < 110) return { zone: 'Fat Burn', color: '#ffb020', pct: 60 };
  if (hr < 130) return { zone: 'Cardio', color: '#ff8040', pct: 80 };
  return { zone: 'Peak', color: C.hr, pct: 95 };
}

function calcHealthScore(
  hr: number | null, spo2: number | null, steps: number | null,
  ml: MLInsights | null, bl: AllBaselines | null,
): number {
  let score = 70;

  if (hr !== null) {
    if (bl?.hrResting?.personalized) {
      // Personalized: how close to YOUR baseline mean?
      const dev = Math.abs(hr - bl.hrResting.mean);
      if (dev < bl.hrResting.std) score += 12;       // within 1 std — great
      else if (dev < 2 * bl.hrResting.std) score += 6; // within 2 std — ok
      else score -= 5;                                  // outside — concern
    } else {
      // Fallback: population thresholds
      if (hr >= 60 && hr <= 85) score += 12;
      else if (hr >= 50 && hr <= 100) score += 6;
      else score -= 5;
    }
  }

  if (spo2 !== null) {
    if (bl?.spo2?.personalized) {
      const dev = bl.spo2.mean - spo2; // lower is worse for SpO2
      if (dev < bl.spo2.std) score += 8;
      else if (dev < 2 * bl.spo2.std) score += 4;
      else score -= 8;
    } else {
      if (spo2 >= 98) score += 8;
      else if (spo2 >= 95) score += 4;
      else score -= 8;
    }
  }

  if (steps !== null) {
    if (steps >= 10000) score += 8;
    else if (steps >= 5000) score += 4;
  }

  // ML-enhanced scoring
  if (ml && ml.activityConfidence > 0) {
    if (ml.stressLevel < 30) score += 5;
    else if (ml.stressLevel > 65) score -= 5;
    if (ml.anomalyDetected) score -= 10;
    if (ml.activity === 'walking' || ml.activity === 'running') score += 3;
  }

  return Math.min(100, Math.max(0, score));
}

function getScoreLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Excellent', color: C.steps };
  if (score >= 75) return { label: 'Good', color: C.primary };
  if (score >= 55) return { label: 'Fair', color: '#ffb020' };
  return { label: 'Needs Attention', color: C.hr };
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
      {values.map((v, i) => (
        <View
          key={i}
          style={[styles.sparkBar, {
            height: 6 + Math.round(((v - min) / range) * 18),
            opacity: 0.4 + (i / values.length) * 0.6,
          }]}
        />
      ))}
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
  const [sleep, setSleep] = useState<any>(null);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [mlInsights, setMlInsights] = useState<MLInsights | null>(null);
  const [dataSource, setDataSource] = useState<'simulator' | 'health_connect'>('simulator');
  const [hcAvailable, setHcAvailable] = useState(false);
  const [baselines, setBaselines] = useState<AllBaselines | null>(null);

  const liveRef = useRef({ hr: 72, spo2: 98, steps: 5200, initialized: false });

  async function fetchStatus() {
    try { setStatus((await getDeviceStatus(token)).status); }
    catch { setStatus('DISCONNECTED'); }
  }

  async function fetchVitals() {
    try {
      const v = await getVitalsLatest(token);
      setVitals(v);
      if (v?.heartRate != null && v?.spo2 != null && v?.steps != null) {
        liveRef.current = { hr: v.heartRate, spo2: v.spo2, steps: v.steps, initialized: true };
        try {
          insertVital(v.heartRate, v.spo2, v.steps, v.timestamp ?? new Date().toISOString());
          setPendingSync(getUnsyncedCount());
        } catch {}
        try {
          addReading({ heartRate: v.heartRate, spo2: v.spo2, steps: v.steps, timestamp: new Date(v.timestamp ?? Date.now()).getTime() });
          setMlInsights(await runInference());
        } catch {}
      }
    } catch { setVitals(null); }
  }

  async function handleSync() {
    setSyncing(true);
    try { await syncNow(token); setPendingSync(getUnsyncedCount()); } catch {}
    setSyncing(false);
  }

  async function fetchSleepData() {
    try { setSleep(await getLatestSleep(token)); } catch { setSleep(null); }
  }

  async function loadAll() {
    // Try to init Health Connect
    try {
      const hc = await initHealthConnect();
      setHcAvailable(hc);
    } catch {}
    await Promise.all([fetchStatus(), fetchVitals(), fetchSleepData()]);
    try { setPendingSync(getUnsyncedCount()); } catch {}
    // Compute local baselines
    try { setBaselines(computeLocalBaselines()); } catch {}
  }

  useEffect(() => { setInitialLoading(true); loadAll().finally(() => setInitialLoading(false)); }, [token]);

  useEffect(() => {
    if (status !== 'CONNECTED') return;
    const id = setInterval(fetchVitals, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [status, token]);

  useEffect(() => {
    if (status !== 'CONNECTED') { setLiveVitals(null); setHrHistory([]); return; }
    if (!liveRef.current.initialized) liveRef.current = { hr: 72, spo2: 98, steps: 5200, initialized: true };
    const id = setInterval(() => {
      const prev = liveRef.current;
      const hr = Math.min(115, Math.max(52, prev.hr + (Math.random() - 0.46) * 3.5));
      const spo2 = Math.min(100, Math.max(94, prev.spo2 + (Math.random() - 0.5) * 0.5));
      const steps = prev.steps + Math.floor(Math.random() * 6);
      liveRef.current = { hr: Math.round(hr), spo2: parseFloat(spo2.toFixed(1)), steps, initialized: true };
      setHrHistory((h) => [...h.slice(-11), Math.round(hr)]);
      setLiveVitals({ heartRate: Math.round(hr), spo2: parseFloat(spo2.toFixed(1)), steps, timestamp: new Date().toISOString() });
    }, LIVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [status]);

  async function handleConnect() {
    setLoading(true);
    try {
      // Try Health Connect first (real smartwatch data)
      if (hcAvailable) {
        const granted = await requestHCPermissions();
        if (granted) {
          setDataSource('health_connect');
          startHCPolling(60000); // poll every 60s
          // Also tell backend device is connected (for alerts/insights)
          try { await connectDevice(token); } catch {}
          setStatus('CONNECTED');
          // Do initial poll
          await pollLatestData();
          const insights = await runInference();
          setMlInsights(insights);
          setLoading(false);
          return;
        }
      }
      // Fallback: use backend simulator
      setDataSource('simulator');
      await connectDevice(token);
      setStatus('CONNECTED');
      await fetchVitals();
    } catch {
      setDataSource('simulator');
      setStatus('CONNECTED');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    stopHCPolling();
    try { await disconnectDevice(token); } catch {}
    setStatus('DISCONNECTED'); setVitals(null); setLiveVitals(null);
    setDataSource('simulator');
    liveRef.current.initialized = false; setLoading(false);
  }

  const displayName = userEmail ? userEmail.split('@')[0] : 'there';
  const isConnected = status === 'CONNECTED';
  const dv = isConnected ? (liveVitals ?? vitals) : vitals;
  const score = calcHealthScore(dv?.heartRate ?? null, dv?.spo2 ?? null, dv?.steps ?? null, mlInsights, baselines);
  const scoreInfo = getScoreLabel(score);
  const hrZone = dv?.heartRate ? getHRZone(dv.heartRate) : null;
  const mlStatus = getModelStatus();

  if (initialLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingText}>Loading your health data...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadAll(); setRefreshing(false); }} colors={[C.primary]} tintColor={C.primary} />}
    >
      {/* Header: Greeting + Device Status inline */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greetingText}>{getGreeting()}, {displayName}</Text>
          <Text style={styles.greetingDate}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.devicePill, isConnected && styles.devicePillConnected, pressed && { opacity: 0.7 }]}
          onPress={isConnected ? handleDisconnect : handleConnect}
          disabled={loading}
        >
          {isConnected && <PulseDot />}
          <Ionicons name={isConnected ? 'watch' : 'watch-outline'} size={16} color={isConnected ? C.connected : C.textMuted} />
          <Text style={[styles.devicePillText, isConnected && { color: C.connected }]}>
            {loading ? '...' : isConnected
              ? (dataSource === 'health_connect' ? 'HC Live' : 'Sim Live')
              : (hcAvailable ? 'Connect Watch' : 'Connect')}
          </Text>
        </Pressable>
      </View>

      {/* Data Source Banner — shows when connected via Health Connect */}
      {isConnected && dataSource === 'health_connect' && (
        <View style={styles.sourceBanner}>
          <Ionicons name="fitness" size={16} color={C.steps} />
          <Text style={styles.sourceText}>
            Receiving real data via <Text style={styles.sourceHighlight}>{getSourceName()}</Text>
          </Text>
          <View style={styles.sourceChip}>
            <View style={styles.sourceDot} />
            <Text style={styles.sourceChipText}>Health Connect</Text>
          </View>
        </View>
      )}

      {/* AI Health Score — ML-enhanced */}
      {isConnected && dv?.heartRate != null && (
        <View style={[styles.card, { borderColor: scoreInfo.color + '40' }]}>
          <View style={styles.scoreHeader}>
            <View style={[styles.scoreBadge, { backgroundColor: scoreInfo.color + '20', borderColor: scoreInfo.color + '40' }]}>
              <Text style={[styles.scoreBadgeText, { color: scoreInfo.color }]}>{scoreInfo.label}</Text>
            </View>
            {mlInsights?.activityConfidence ? (
              <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI-Enhanced</Text></View>
            ) : null}
          </View>
          <View style={styles.scoreRow}>
            <Text style={[styles.scoreValue, { color: scoreInfo.color }]}>{score}</Text>
            <View style={styles.scoreDetail}>
              <Text style={styles.scoreLabel}>Health Score</Text>
              <View style={styles.scoreBarBg}>
                <View style={[styles.scoreBarFill, { width: `${score}%` as any, backgroundColor: scoreInfo.color }]} />
              </View>
              <Text style={styles.scoreHint}>
                {score >= 85 ? 'Your vitals look great right now' :
                 score >= 65 ? 'Looking good, keep it up' :
                 'Some metrics need attention'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Personal Baselines — "Your Normal" */}
      {baselines && baselines.learningProgress > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="person-circle" size={18} color={C.primary} />
            <Text style={styles.cardTitle}> Your Normal</Text>
            {baselines.isPersonalized ? (
              <View style={styles.personalizedBadge}><Text style={styles.personalizedBadgeText}>Personalized</Text></View>
            ) : (
              <View style={styles.learningBadge}>
                <Text style={styles.learningBadgeText}>Learning {baselines.learningProgress}%</Text>
              </View>
            )}
          </View>

          {baselines.hrResting && (
            <View style={styles.baselineRow}>
              <View style={[styles.baselineIcon, { backgroundColor: C.hrBg }]}>
                <Ionicons name="heart" size={14} color={C.hr} />
              </View>
              <View style={styles.baselineInfo}>
                <Text style={styles.baselineLabel}>Resting HR</Text>
                <Text style={styles.baselineRange}>
                  <Text style={{ color: C.hr, fontWeight: '800' }}>{baselines.hrResting.lowerBound}-{baselines.hrResting.upperBound}</Text>
                  <Text style={{ color: C.textMuted }}> bpm (avg {baselines.hrResting.mean})</Text>
                </Text>
              </View>
              {dv?.heartRate != null && (() => {
                const msg = describeDeviation(dv.heartRate, baselines.hrResting, 'HR');
                return msg ? <Ionicons name="alert-circle" size={16} color={C.hr} /> : <Ionicons name="checkmark-circle" size={16} color={C.steps} />;
              })()}
            </View>
          )}

          {baselines.spo2 && (
            <View style={styles.baselineRow}>
              <View style={[styles.baselineIcon, { backgroundColor: C.spo2Bg }]}>
                <Ionicons name="water" size={14} color={C.spo2} />
              </View>
              <View style={styles.baselineInfo}>
                <Text style={styles.baselineLabel}>SpO2</Text>
                <Text style={styles.baselineRange}>
                  <Text style={{ color: C.spo2, fontWeight: '800' }}>{baselines.spo2.lowerBound}-{baselines.spo2.upperBound}</Text>
                  <Text style={{ color: C.textMuted }}> % (avg {baselines.spo2.mean})</Text>
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={16} color={C.steps} />
            </View>
          )}

          {baselines.hrActive && (
            <View style={[styles.baselineRow, { marginBottom: 0 }]}>
              <View style={[styles.baselineIcon, { backgroundColor: 'rgba(255,128,64,0.12)' }]}>
                <Ionicons name="flash" size={14} color="#ff8040" />
              </View>
              <View style={styles.baselineInfo}>
                <Text style={styles.baselineLabel}>Active HR</Text>
                <Text style={styles.baselineRange}>
                  <Text style={{ color: '#ff8040', fontWeight: '800' }}>{baselines.hrActive.lowerBound}-{baselines.hrActive.upperBound}</Text>
                  <Text style={{ color: C.textMuted }}> bpm (avg {baselines.hrActive.mean})</Text>
                </Text>
              </View>
            </View>
          )}

          {!baselines.isPersonalized && (
            <View style={styles.learningBar}>
              <View style={styles.learningBarBg}>
                <View style={[styles.learningBarFill, { width: `${baselines.learningProgress}%` as any }]} />
              </View>
              <Text style={styles.learningHint}>
                {baselines.learningProgress < 50
                  ? 'Keep wearing — learning your patterns...'
                  : 'Almost there — baselines personalize at 7 days'}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Live Vitals — the core real-time view */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="pulse" size={18} color={C.hr} />
          <Text style={styles.cardTitle}> Live Vitals</Text>
          {isConnected && <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>LIVE</Text></View>}
        </View>

        {dv?.heartRate != null ? (
          <>
            <View style={styles.vitalsGrid}>
              <View style={[styles.vitalTile, { backgroundColor: C.hrBg, borderColor: 'rgba(255,83,112,0.25)' }]}>
                <Ionicons name="heart" size={20} color={C.hr} />
                <Text style={[styles.vitalValue, { color: C.hr }]}>{dv.heartRate}</Text>
                <Text style={[styles.vitalUnit, { color: C.hr }]}>bpm</Text>
              </View>
              <View style={[styles.vitalTile, { backgroundColor: C.spo2Bg, borderColor: 'rgba(0,212,255,0.2)' }]}>
                <Ionicons name="water" size={20} color={C.spo2} />
                <Text style={[styles.vitalValue, { color: C.spo2 }]}>{dv.spo2}</Text>
                <Text style={[styles.vitalUnit, { color: C.spo2 }]}>%</Text>
              </View>
              <View style={[styles.vitalTile, { backgroundColor: C.stepsBg, borderColor: 'rgba(0,229,160,0.2)' }]}>
                <Ionicons name="footsteps" size={20} color={C.steps} />
                <Text style={[styles.vitalValue, { color: C.steps }]}>
                  {dv.steps != null ? dv.steps >= 1000 ? `${(dv.steps / 1000).toFixed(1)}k` : String(dv.steps) : '—'}
                </Text>
                <Text style={[styles.vitalUnit, { color: C.steps }]}>steps</Text>
              </View>
            </View>

            {/* HR Zone + Sparkline */}
            {hrZone && (
              <View style={[styles.zoneRow, { borderColor: hrZone.color + '30' }]}>
                <View style={[styles.zoneDot, { backgroundColor: hrZone.color }]} />
                <Text style={styles.zoneLabel}>Zone</Text>
                <Text style={[styles.zoneName, { color: hrZone.color }]}>{hrZone.zone}</Text>
                <View style={styles.zoneBarBg}>
                  <View style={[styles.zoneBarFill, { width: `${hrZone.pct}%` as any, backgroundColor: hrZone.color }]} />
                </View>
                {hrHistory.length > 2 && <SparkBar values={hrHistory} />}
              </View>
            )}

            {dv.timestamp && (
              <Text style={styles.timestamp}>Updated {new Date(dv.timestamp).toLocaleTimeString()}</Text>
            )}
          </>
        ) : (
          <View style={styles.emptyVitals}>
            <Ionicons name="pulse-outline" size={40} color={C.textMuted} />
            <Text style={styles.hint}>{isConnected ? 'Waiting for first reading...' : 'Connect your device to see live vitals'}</Text>
          </View>
        )}
      </View>

      {/* AI Intelligence Card — unique to Home */}
      {mlInsights && mlInsights.activityConfidence > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="hardware-chip-outline" size={18} color="#a67ffa" />
            <Text style={styles.cardTitle}> AI Intelligence</Text>
            <View style={styles.mlBadge}><Text style={styles.mlBadgeText}>LIVE</Text></View>
          </View>

          {/* 3-column quick stats */}
          <View style={styles.aiGrid}>
            {/* Activity */}
            <View style={styles.aiItem}>
              <View style={[styles.aiIconBg, { backgroundColor: 'rgba(0,229,160,0.12)' }]}>
                <Ionicons
                  name={mlInsights.activity === 'sleeping' ? 'moon' : mlInsights.activity === 'running' ? 'bicycle' : mlInsights.activity === 'walking' ? 'walk' : 'body'}
                  size={20} color={C.steps}
                />
              </View>
              <Text style={[styles.aiValue, { color: C.steps }]}>
                {mlInsights.activity.charAt(0).toUpperCase() + mlInsights.activity.slice(1)}
              </Text>
              <Text style={styles.aiLabel}>Activity</Text>
            </View>

            {/* Stress */}
            <View style={styles.aiItem}>
              <View style={[styles.aiIconBg, {
                backgroundColor: mlInsights.stressLabel === 'high' ? 'rgba(255,83,112,0.12)' :
                  mlInsights.stressLabel === 'moderate' ? 'rgba(255,176,32,0.12)' : 'rgba(0,229,160,0.12)',
              }]}>
                <Ionicons name="fitness" size={20} color={
                  mlInsights.stressLabel === 'high' ? C.hr : mlInsights.stressLabel === 'moderate' ? '#ffb020' : C.steps
                } />
              </View>
              <Text style={[styles.aiValue, {
                color: mlInsights.stressLabel === 'high' ? C.hr : mlInsights.stressLabel === 'moderate' ? '#ffb020' : C.steps,
              }]}>{mlInsights.stressLevel}</Text>
              <Text style={styles.aiLabel}>Stress</Text>
            </View>

            {/* Shield / Anomaly Status */}
            <View style={styles.aiItem}>
              <View style={[styles.aiIconBg, {
                backgroundColor: mlInsights.anomalyDetected ? 'rgba(255,83,112,0.12)' : 'rgba(0,229,160,0.12)',
              }]}>
                <Ionicons
                  name={mlInsights.anomalyDetected ? 'warning' : 'shield-checkmark'}
                  size={20}
                  color={mlInsights.anomalyDetected ? C.hr : C.steps}
                />
              </View>
              <Text style={[styles.aiValue, { color: mlInsights.anomalyDetected ? C.hr : C.steps }]}>
                {mlInsights.anomalyDetected ? 'Alert' : 'Normal'}
              </Text>
              <Text style={styles.aiLabel}>Status</Text>
            </View>
          </View>

          {/* Anomaly Alert Banner */}
          {mlInsights.anomalyDetected && mlInsights.anomalyMessage && (
            <View style={styles.anomalyBanner}>
              <Ionicons name="warning" size={16} color={C.hr} />
              <Text style={styles.anomalyText}>{mlInsights.anomalyMessage}</Text>
            </View>
          )}

          {/* ML Data Info */}
          <View style={styles.mlFooter}>
            <Ionicons name="analytics-outline" size={12} color={C.textMuted} />
            <Text style={styles.mlFooterText}>
              {mlStatus.bufferSize} readings analyzed
              {mlStatus.lastInferenceTime ? ` · ${new Date(mlStatus.lastInferenceTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
            </Text>
          </View>
        </View>
      )}

      {/* Collecting data message */}
      {mlInsights && mlInsights.activityConfidence === 0 && mlInsights.anomalyMessage && (
        <View style={[styles.card, styles.collectingCard]}>
          <Ionicons name="hourglass-outline" size={20} color={C.textMuted} />
          <Text style={styles.collectingText}>{mlInsights.anomalyMessage}</Text>
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        {pendingSync > 0 && (
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
            onPress={handleSync}
            disabled={syncing}
          >
            <Ionicons name="cloud-upload-outline" size={18} color={C.primary} />
            <Text style={styles.actionLabel}>{syncing ? 'Syncing...' : `Sync (${pendingSync})`}</Text>
          </Pressable>
        )}
        {sleep && (
          <View style={styles.actionBtn}>
            <Ionicons name="moon" size={18} color={C.sleep} />
            <Text style={styles.actionLabel}>
              Sleep {sleep.qualityScore?.toFixed(0)}/100
            </Text>
          </View>
        )}
        <View style={styles.actionBtn}>
          <Ionicons name="time-outline" size={18} color={C.gold} />
          <Text style={styles.actionLabel}>
            {Math.round((dv?.steps ?? 0) * 0.04)} kcal
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, gap: 14, paddingBottom: 36 },
  loadingScreen: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', gap: 14 },
  loadingText: { fontSize: 15, color: C.textSub },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, paddingTop: 4 },
  greetingText: { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: 0.2 },
  greetingDate: { fontSize: 13, color: C.textSub, marginTop: 3 },
  devicePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: C.cardBorder,
  },
  devicePillConnected: { borderColor: 'rgba(0,229,160,0.4)', backgroundColor: 'rgba(0,229,160,0.08)' },
  devicePillText: { fontSize: 12, fontWeight: '700', color: C.textMuted },

  // Health Score
  scoreHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  scoreBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  scoreBadgeText: { fontSize: 11, fontWeight: '800' },
  aiBadge: { backgroundColor: 'rgba(166,127,250,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(166,127,250,0.3)' },
  aiBadgeText: { fontSize: 9, fontWeight: '700', color: '#a67ffa', letterSpacing: 0.5 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scoreValue: { fontSize: 56, fontWeight: '900', lineHeight: 60 },
  scoreDetail: { flex: 1 },
  scoreLabel: { fontSize: 12, color: C.textSub, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  scoreBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  scoreBarFill: { height: 6, borderRadius: 3 },
  scoreHint: { fontSize: 12, color: C.textMuted, fontStyle: 'italic' },

  // Card
  card: { backgroundColor: C.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.cardBorder },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },

  // Pulse
  pulseContainer: { width: 16, height: 16, justifyContent: 'center', alignItems: 'center' },
  pulseRing: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: C.connected },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.connected },

  // Live badge
  liveBadge: { marginLeft: 'auto' as any, backgroundColor: 'rgba(255,83,112,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,83,112,0.4)' },
  liveBadgeText: { fontSize: 10, fontWeight: '800', color: C.hr, letterSpacing: 1 },

  // Vitals
  vitalsGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  vitalTile: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 3, borderWidth: 1 },
  vitalValue: { fontSize: 24, fontWeight: '800' },
  vitalUnit: { fontSize: 11, fontWeight: '700', marginTop: -2, opacity: 0.8 },

  // Zone
  zoneRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, marginBottom: 10, gap: 6 },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneLabel: { fontSize: 12, color: C.textSub },
  zoneName: { fontSize: 12, fontWeight: '700' },
  zoneBarBg: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginHorizontal: 4 },
  zoneBarFill: { height: 4, borderRadius: 2 },

  // Spark
  sparkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginLeft: 4 },
  sparkBar: { width: 3, borderRadius: 1.5, backgroundColor: C.hr },

  timestamp: { fontSize: 11, color: C.textMuted, textAlign: 'right' },
  emptyVitals: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  hint: { fontSize: 13, color: C.textSub, textAlign: 'center', fontStyle: 'italic' },

  // AI Intelligence
  mlBadge: { marginLeft: 'auto' as any, backgroundColor: 'rgba(0,229,160,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(0,229,160,0.3)' },
  mlBadgeText: { fontSize: 10, fontWeight: '800', color: C.steps, letterSpacing: 0.8 },
  aiGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  aiItem: { flex: 1, alignItems: 'center', gap: 6 },
  aiIconBg: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  aiValue: { fontSize: 16, fontWeight: '800' },
  aiLabel: { fontSize: 10, color: C.textMuted },
  anomalyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,83,112,0.1)', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(255,83,112,0.3)', marginBottom: 8 },
  anomalyText: { flex: 1, fontSize: 13, color: C.hr, fontWeight: '600' },
  mlFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  mlFooterText: { fontSize: 11, color: C.textMuted },

  // Collecting
  collectingCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  collectingText: { fontSize: 13, color: C.textMuted, fontStyle: 'italic', flex: 1 },

  // Quick Actions
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: C.card, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10,
    borderWidth: 1, borderColor: C.cardBorder,
  },
  actionLabel: { fontSize: 12, fontWeight: '600', color: C.textSub },

  // Baselines
  personalizedBadge: {
    marginLeft: 'auto' as any,
    backgroundColor: 'rgba(0,229,160,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,229,160,0.3)',
  },
  personalizedBadgeText: { fontSize: 10, fontWeight: '800', color: C.steps, letterSpacing: 0.6 },
  learningBadge: {
    marginLeft: 'auto' as any,
    backgroundColor: 'rgba(77,138,240,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(77,138,240,0.3)',
  },
  learningBadgeText: { fontSize: 10, fontWeight: '700', color: C.primary },
  baselineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  baselineIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  baselineInfo: { flex: 1 },
  baselineLabel: { fontSize: 11, color: C.textMuted, marginBottom: 1 },
  baselineRange: { fontSize: 13 },
  learningBar: { marginTop: 8 },
  learningBarBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  learningBarFill: { height: 4, borderRadius: 2, backgroundColor: C.primary },
  learningHint: { fontSize: 11, color: C.textMuted, fontStyle: 'italic' },

  // Data Source Banner
  sourceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,229,160,0.08)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,229,160,0.25)',
  },
  sourceText: { flex: 1, fontSize: 13, color: C.textSub },
  sourceHighlight: { color: C.steps, fontWeight: '700' },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,229,160,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sourceDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.steps },
  sourceChipText: { fontSize: 10, fontWeight: '700', color: C.steps },
});
