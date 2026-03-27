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
import { useAuth } from '@/lib/auth';
import { getVitalsAggregate, getAlertStats, getVitalsTrends } from '@/lib/api';

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
    fetchAnalytics().finally(() => setLoading(false));
  }, [fetchAnalytics]);

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
});
