import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { LineChart, BarChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { getVitalsAggregate, getAlertStats, getVitalsTrends } from '@/lib/api';
import { getWindow, getBufferSize } from '@/lib/ml/vitalsBuffer';
import { estimateStress } from '@/lib/ml/models/stressEstimator';
import { classifyActivity } from '@/lib/ml/models/activityClassifier';
import type { VitalReading } from '@/lib/ml/types';

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
  alert: '#ffb020',
  alertBg: 'rgba(255,176,32,0.12)',
  text: '#e8f0fe',
  textSub: '#7a97c0',
  textMuted: '#3d5478',
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 36;

interface AggregateBucket {
  bucket: string;
  avgHeartRate: number | null;
  avgSpO2: number | null;
  totalSteps: number | null;
}
interface AlertStat {
  date: string;
  alertCount: number;
}

function subsample(labels: string[], values: number[], maxPoints = 12) {
  if (labels.length <= maxPoints) return { labels, values };
  const step = Math.ceil(labels.length / maxPoints);
  return {
    labels: labels.filter((_, i) => i % step === 0),
    values: values.filter((_, i) => i % step === 0),
  };
}

const mkConfig = (fromColor: string, toColor: string, lineColor: string) => ({
  backgroundColor: 'transparent',
  backgroundGradientFrom: fromColor,
  backgroundGradientTo: toColor,
  decimalPlaces: 0,
  color: (opacity = 1) => lineColor.replace(')', `, ${opacity})`).replace('rgb', 'rgba'),
  labelColor: () => C.textSub,
  propsForDots: { r: '4', strokeWidth: '2', stroke: lineColor, fill: fromColor },
  propsForBackgroundLines: { strokeDasharray: '4', stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 },
  barPercentage: 0.6,
  fillShadowGradientOpacity: 0.25,
});

const hrConfig = mkConfig('#1a0a14', '#1a0a14', '#ff5370');
const spo2Config = mkConfig('#021b22', '#021b22', '#00d4ff');
const stepsConfig = {
  ...mkConfig('#021a10', '#021a10', '#00e5a0'),
  barPercentage: 0.55,
};
const alertConfig = {
  ...mkConfig('#1a1203', '#1a1203', '#ffb020'),
  barPercentage: 0.55,
};

const trendDirectionIcon: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  increasing: 'trending-up',
  decreasing: 'trending-down',
  stable: 'remove',
};
const trendDirectionColor: Record<string, string> = {
  increasing: '#ff5370',
  decreasing: '#4d8af0',
  stable: '#00e5a0',
};

export default function AnalyticsScreen() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hourlyData, setHourlyData] = useState<AggregateBucket[]>([]);
  const [dailyData, setDailyData] = useState<AggregateBucket[]>([]);
  const [alertData, setAlertData] = useState<AlertStat[]>([]);
  const [trends, setTrends] = useState<any>(null);
  const [stressHistory, setStressHistory] = useState<{ time: string; level: number }[]>([]);
  const [activityBreakdown, setActivityBreakdown] = useState<Record<string, number>>({
    sedentary: 0, walking: 0, running: 0, sleeping: 0,
  });

  const fetchMLData = useCallback(async () => {
    const buffer = getWindow(360);
    if (buffer.length < 12) return;

    // Build stress history from buffer in 5-min chunks
    const stressPoints: { time: string; level: number }[] = [];
    const activityCounts: Record<string, number> = { sedentary: 0, walking: 0, running: 0, sleeping: 0 };

    // Sample every 60 readings (5 min) for stress
    for (let i = 60; i <= buffer.length; i += 30) {
      const chunk = buffer.slice(i - 60, i);
      const hrValues = chunk.map((r) => r.heartRate);
      const stats = computeStatsLocal(hrValues);
      let stress = 0;
      if (stats.mean > 100) stress += 30;
      else if (stats.mean > 85) stress += 15;
      else if (stats.mean > 75) stress += 5;
      if (stats.rmssd < 10) stress += 30;
      else if (stats.rmssd < 20) stress += 15;
      if (stats.std > 15 && stats.mean > 85) stress += 15;
      if (stats.min > 80) stress += 10;
      stress = Math.min(100, Math.max(0, stress));

      const ts = new Date(chunk[chunk.length - 1].timestamp);
      stressPoints.push({
        time: `${ts.getHours().toString().padStart(2, '0')}:${ts.getMinutes().toString().padStart(2, '0')}`,
        level: stress,
      });
    }
    setStressHistory(stressPoints);

    // Activity breakdown from buffer in 12-reading chunks
    for (let i = 12; i <= buffer.length; i += 12) {
      const chunk = buffer.slice(i - 12, i);
      const avgHR = chunk.reduce((s, r) => s + r.heartRate, 0) / chunk.length;
      let stepDelta = 0;
      for (let j = 1; j < chunk.length; j++) {
        stepDelta += Math.max(0, chunk[j].steps - chunk[j - 1].steps);
      }
      const avgStep = stepDelta / (chunk.length - 1);

      if (avgHR < 62 && avgStep < 0.5) activityCounts.sleeping++;
      else if (avgHR > 120 && avgStep > 5) activityCounts.running++;
      else if (avgStep > 1 || (avgHR > 85 && avgStep > 0.3)) activityCounts.walking++;
      else activityCounts.sedentary++;
    }
    setActivityBreakdown(activityCounts);
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      setError(null);
      const [hourly, daily, alerts, tr] = await Promise.all([
        getVitalsAggregate(token, 'hourly'),
        getVitalsAggregate(token, 'daily'),
        getAlertStats(token, '7d'),
        getVitalsTrends(token, 'weekly'),
      ]);
      setHourlyData(hourly);
      setDailyData(daily);
      setAlertData(alerts);
      setTrends(tr);
    } catch (e: any) {
      setError(e.message || 'Failed to load analytics');
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAnalytics(), fetchMLData()]).finally(() => setLoading(false));
  }, [fetchAnalytics, fetchMLData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <View style={styles.errorIcon}>
          <Ionicons name="warning-outline" size={36} color={C.hr} />
        </View>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const rawHrLabels = hourlyData.map((d) => {
    const dt = new Date(d.bucket);
    return `${dt.getHours().toString().padStart(2, '0')}h`;
  });
  const rawHrValues = hourlyData.map((d) => d.avgHeartRate ?? 0);
  const rawSpo2Values = hourlyData.map((d) => d.avgSpO2 ?? 0);
  const { labels: hrLabels, values: hrValues } = subsample(rawHrLabels, rawHrValues);
  const { values: spo2Values } = subsample(rawHrLabels, rawSpo2Values);

  const stepsLabels = dailyData.map((d) =>
    new Date(d.bucket).toLocaleDateString('en-US', { weekday: 'short' })
  );
  const stepsValues = dailyData.map((d) => Number(d.totalSteps ?? 0));

  const alertLabels = alertData.map((d) =>
    new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })
  );
  const alertValues = alertData.map((d) => d.alertCount);

  const rawTrendLabels = (trends?.dailyData ?? []).map((d: any) =>
    new Date(d.bucket).toLocaleDateString('en-US', { weekday: 'short' })
  );
  const rawTrendValues = (trends?.dailyData ?? []).map((d: any) => d.avgHeartRate ?? 0);
  const { labels: trendLabels, values: trendValues } = subsample(rawTrendLabels, rawTrendValues);

  const hasHourlyData = hrLabels.length > 1;
  const hasDailyData = stepsLabels.length > 0;
  const hasAlertData = alertLabels.length > 0;
  const hasTrendData = trendLabels.length > 0;
  const trendDir: string = trends?.trendDirection ?? 'stable';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} tintColor={C.primary} />
      }
    >
      {/* View Reports Button */}
      <TouchableOpacity style={styles.reportsBtn} onPress={() => router.push('/(tabs)/reports')} activeOpacity={0.8}>
        <Ionicons name="document-text" size={18} color={C.primary} />
        <Text style={styles.reportsBtnText}>Daily Health Reports</Text>
        <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
      </TouchableOpacity>

      {/* Weekly Summary Banner */}
      <View style={styles.summaryBanner}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: C.hr }]}>{trends?.avgHeartRate ?? '—'}</Text>
          <Text style={styles.summaryLabel}>Avg HR</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: C.spo2 }]}>{trends?.minHeartRate ?? '—'}</Text>
          <Text style={styles.summaryLabel}>Min HR</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: C.alert }]}>{trends?.maxHeartRate ?? '—'}</Text>
          <Text style={styles.summaryLabel}>Max HR</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Ionicons
            name={trendDirectionIcon[trendDir] ?? 'remove'}
            size={24}
            color={trendDirectionColor[trendDir] ?? C.steps}
          />
          <Text style={styles.summaryLabel}>Trend</Text>
        </View>
      </View>

      {/* Weekly HR Trend */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconDot, { backgroundColor: C.hrBg }]}>
            <Ionicons name="heart" size={16} color={C.hr} />
          </View>
          <View>
            <Text style={styles.cardTitle}>Weekly Heart Rate</Text>
            <Text style={styles.cardSubtitle}>7-day daily average</Text>
          </View>
        </View>
        {hasTrendData ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <LineChart
              data={{ labels: trendLabels, datasets: [{ data: trendValues.length > 0 ? trendValues : [0] }] }}
              width={Math.max(CHART_WIDTH, trendLabels.length * 55)}
              height={200}
              chartConfig={hrConfig}
              bezier
              style={styles.chart}
              yAxisSuffix=""
              fromZero={false}
            />
          </ScrollView>
        ) : (
          <EmptyChart label="No weekly data yet — connect your device and check back" icon="heart-outline" color={C.hr} />
        )}
      </View>

      {/* HR 24h */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconDot, { backgroundColor: C.hrBg }]}>
            <Ionicons name="pulse" size={16} color={C.hr} />
          </View>
          <View>
            <Text style={styles.cardTitle}>Heart Rate · Last 24h</Text>
            <Text style={styles.cardSubtitle}>Hourly averages</Text>
          </View>
        </View>
        {hasHourlyData ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <LineChart
              data={{ labels: hrLabels, datasets: [{ data: hrValues.length > 0 ? hrValues : [0] }] }}
              width={Math.max(CHART_WIDTH, hrLabels.length * 44)}
              height={200}
              chartConfig={hrConfig}
              bezier
              style={styles.chart}
              yAxisSuffix=""
              fromZero={false}
            />
          </ScrollView>
        ) : (
          <EmptyChart label="No heart rate data yet" icon="pulse-outline" color={C.hr} />
        )}
      </View>

      {/* SpO2 24h */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconDot, { backgroundColor: C.spo2Bg }]}>
            <Ionicons name="water" size={16} color={C.spo2} />
          </View>
          <View>
            <Text style={styles.cardTitle}>SpO2 · Last 24h</Text>
            <Text style={styles.cardSubtitle}>Hourly averages</Text>
          </View>
        </View>
        {hasHourlyData ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <LineChart
              data={{ labels: hrLabels, datasets: [{ data: spo2Values.length > 0 ? spo2Values : [0] }] }}
              width={Math.max(CHART_WIDTH, hrLabels.length * 44)}
              height={200}
              chartConfig={spo2Config}
              bezier
              style={styles.chart}
              yAxisSuffix="%"
              fromZero={false}
            />
          </ScrollView>
        ) : (
          <EmptyChart label="No SpO2 data yet" icon="water-outline" color={C.spo2} />
        )}
      </View>

      {/* Daily Steps */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconDot, { backgroundColor: C.stepsBg }]}>
            <Ionicons name="footsteps" size={16} color={C.steps} />
          </View>
          <View>
            <Text style={styles.cardTitle}>Daily Steps</Text>
            <Text style={styles.cardSubtitle}>Last 7 days</Text>
          </View>
        </View>
        {hasDailyData ? (
          <BarChart
            data={{ labels: stepsLabels, datasets: [{ data: stepsValues.length > 0 ? stepsValues : [0] }] }}
            width={CHART_WIDTH}
            height={200}
            chartConfig={stepsConfig}
            style={styles.chart}
            yAxisSuffix=""
            yAxisLabel=""
            fromZero
          />
        ) : (
          <EmptyChart label="No steps data yet" icon="footsteps-outline" color={C.steps} />
        )}
      </View>

      {/* ML: Stress Trend */}
      {stressHistory.length > 1 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconDot, { backgroundColor: 'rgba(255,208,96,0.12)' }]}>
              <Ionicons name="pulse" size={16} color="#ffb020" />
            </View>
            <View>
              <Text style={styles.cardTitle}>Stress Level Trend</Text>
              <Text style={styles.cardSubtitle}>On-device AI analysis</Text>
            </View>
            <View style={styles.mlTag}><Text style={styles.mlTagText}>TinyML</Text></View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <LineChart
              data={{
                labels: stressHistory.map((s) => s.time),
                datasets: [{ data: stressHistory.map((s) => s.level) }],
              }}
              width={Math.max(CHART_WIDTH, stressHistory.length * 55)}
              height={200}
              chartConfig={{
                ...mkConfig('#1a1203', '#1a1203', '#ffb020'),
                decimalPlaces: 0,
              }}
              bezier
              style={styles.chart}
              yAxisSuffix=""
              fromZero
            />
          </ScrollView>
        </View>
      )}

      {/* ML: Activity Breakdown */}
      {Object.values(activityBreakdown).some((v) => v > 0) && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconDot, { backgroundColor: 'rgba(166,127,250,0.12)' }]}>
              <Ionicons name="body" size={16} color="#a67ffa" />
            </View>
            <View>
              <Text style={styles.cardTitle}>Activity Breakdown</Text>
              <Text style={styles.cardSubtitle}>On-device AI classification</Text>
            </View>
            <View style={styles.mlTag}><Text style={styles.mlTagText}>TinyML</Text></View>
          </View>
          {(() => {
            const total = Object.values(activityBreakdown).reduce((a, b) => a + b, 0);
            if (total === 0) return null;
            const items = [
              { key: 'sedentary', label: 'Sedentary', icon: 'body' as const, color: '#7a97c0' },
              { key: 'walking', label: 'Walking', icon: 'walk' as const, color: '#00e5a0' },
              { key: 'running', label: 'Running', icon: 'bicycle' as const, color: '#ff5370' },
              { key: 'sleeping', label: 'Sleeping', icon: 'moon' as const, color: '#a67ffa' },
            ];
            return items.map((item) => {
              const count = activityBreakdown[item.key] || 0;
              const pct = Math.round((count / total) * 100);
              return (
                <View key={item.key} style={styles.actRow}>
                  <Ionicons name={item.icon} size={16} color={item.color} style={{ width: 24 }} />
                  <Text style={styles.actLabel}>{item.label}</Text>
                  <View style={styles.actBarBg}>
                    <View style={[styles.actBarFill, { width: `${pct}%` as any, backgroundColor: item.color }]} />
                  </View>
                  <Text style={[styles.actPct, { color: item.color }]}>{pct}%</Text>
                </View>
              );
            });
          })()}
        </View>
      )}

      {/* Alert Frequency */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconDot, { backgroundColor: C.alertBg }]}>
            <Ionicons name="notifications" size={16} color={C.alert} />
          </View>
          <View>
            <Text style={styles.cardTitle}>Alert Frequency</Text>
            <Text style={styles.cardSubtitle}>Last 7 days</Text>
          </View>
        </View>
        {hasAlertData && alertValues.some((v) => v > 0) ? (
          <BarChart
            data={{ labels: alertLabels, datasets: [{ data: alertValues.length > 0 ? alertValues : [0] }] }}
            width={CHART_WIDTH}
            height={200}
            chartConfig={alertConfig}
            style={styles.chart}
            yAxisSuffix=""
            yAxisLabel=""
            fromZero
          />
        ) : (
          <View style={styles.allClear}>
            <View style={styles.allClearIcon}>
              <Ionicons name="checkmark-circle" size={32} color={C.steps} />
            </View>
            <Text style={styles.allClearTitle}>All clear!</Text>
            <Text style={styles.allClearSub}>No alerts in the last 7 days</Text>
          </View>
        )}
      </View>

    </ScrollView>
  );
}

function computeStatsLocal(values: number[]) {
  const n = values.length;
  if (n === 0) return { mean: 0, std: 0, min: 0, max: 0, rmssd: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  let sumSqDiff = 0;
  for (let i = 1; i < n; i++) sumSqDiff += (values[i] - values[i - 1]) ** 2;
  const rmssd = n > 1 ? Math.sqrt(sumSqDiff / (n - 1)) : 0;
  return { mean, std, min, max, rmssd };
}

function EmptyChart({ label, icon, color }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }) {
  return (
    <View style={styles.emptyChart}>
      <Ionicons name={icon} size={36} color={color} style={{ opacity: 0.4 }} />
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, gap: 14, paddingBottom: 40 },
  center: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 14,
  },
  loadingText: { fontSize: 15, color: C.textSub },
  errorIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,83,112,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: { fontSize: 15, color: C.textSub, textAlign: 'center' },
  retryBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 12,
  },
  retryBtnText: { color: C.text, fontWeight: '700', fontSize: 15 },

  summaryBanner: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: C.textMuted, textAlign: 'center' },
  summaryDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.08)' },

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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  iconDot: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  cardSubtitle: { fontSize: 12, color: C.textMuted, marginTop: 1 },
  chart: { borderRadius: 12, marginTop: 4, overflow: 'hidden' },

  emptyChart: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyText: { fontSize: 13, color: C.textMuted, fontStyle: 'italic', textAlign: 'center', maxWidth: 240 },

  allClear: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  allClearIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,229,160,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  allClearTitle: { fontSize: 16, fontWeight: '700', color: C.steps },
  allClearSub: { fontSize: 13, color: C.textMuted },

  // ML
  mlTag: {
    marginLeft: 'auto' as any,
    backgroundColor: 'rgba(166,127,250,0.2)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(166,127,250,0.4)',
  },
  mlTagText: { fontSize: 9, fontWeight: '800', color: '#a67ffa', letterSpacing: 0.6 },
  actRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  actLabel: { fontSize: 13, color: C.textSub, width: 72 },
  actBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  actBarFill: { height: 8, borderRadius: 4 },
  actPct: { fontSize: 13, fontWeight: '700', width: 36, textAlign: 'right' },

  // Reports button
  reportsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  reportsBtnText: { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
});
