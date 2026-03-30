package com.smartwatch.service;

import com.smartwatch.dto.BaselineResponse;
import com.smartwatch.model.User;
import com.smartwatch.model.UserBaseline;
import com.smartwatch.model.Vital;
import com.smartwatch.repository.UserBaselineRepository;
import com.smartwatch.repository.UserRepository;
import com.smartwatch.repository.VitalRepository;
import com.smartwatch.exception.NotFoundException;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.DoubleSummaryStatistics;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Computes and stores adaptive personal baselines from user vitals.
 * Uses data from the last 14 days to establish "Your Normal" ranges.
 *
 * Metrics tracked:
 * - hr_resting: Heart rate during low-activity periods (HR < 90, steps delta ~0)
 * - hr_active: Heart rate during active periods
 * - spo2: Blood oxygen saturation
 * - steps_daily: Daily step count
 *
 * A baseline is considered "personalized" when sampleCount >= 1008
 * (~7 days of data at 12 readings/hour for 12 waking hours).
 */
@Service
public class BaselineService {

    private static final int MIN_SAMPLES_FOR_PERSONALIZATION = 1008;
    private static final int LOOKBACK_DAYS = 14;

    private final UserBaselineRepository baselineRepo;
    private final VitalRepository vitalRepo;
    private final UserRepository userRepo;

    public BaselineService(UserBaselineRepository baselineRepo, VitalRepository vitalRepo, UserRepository userRepo) {
        this.baselineRepo = baselineRepo;
        this.vitalRepo = vitalRepo;
        this.userRepo = userRepo;
    }

    /** Get all baselines for a user, computing them if stale or missing */
    public List<BaselineResponse> getBaselines(Long userId) {
        if (!userRepo.existsById(userId)) throw new NotFoundException("User not found");

        // Recompute baselines from recent data
        recomputeBaselines(userId);

        return baselineRepo.findByUserId(userId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    /** Get a specific baseline metric */
    public BaselineResponse getBaseline(Long userId, String metric) {
        recomputeBaselines(userId);
        return baselineRepo.findByUserIdAndMetric(userId, metric)
                .map(this::toResponse)
                .orElse(null);
    }

    /** Check if baselines are personalized (enough data collected) */
    public boolean isPersonalized(Long userId) {
        return baselineRepo.findByUserIdAndMetric(userId, "hr_resting")
                .map(b -> b.getSampleCount() >= MIN_SAMPLES_FOR_PERSONALIZATION)
                .orElse(false);
    }

    /** Get the personalized HR threshold for alerts (replaces fixed 220-age) */
    public Integer getPersonalizedHRThreshold(Long userId) {
        return baselineRepo.findByUserIdAndMetric(userId, "hr_resting")
                .filter(b -> b.getSampleCount() >= MIN_SAMPLES_FOR_PERSONALIZATION)
                .map(b -> (int) Math.round(b.getBaselineMean() + 2 * b.getBaselineStd()))
                .orElse(null);
    }

    /** Recompute baselines from last 14 days of vitals */
    public void recomputeBaselines(Long userId) {
        User user = userRepo.findById(userId).orElse(null);
        if (user == null) return;

        LocalDateTime since = LocalDateTime.now().minusDays(LOOKBACK_DAYS);
        List<Vital> vitals = vitalRepo.findByUserIdAndTimestampBetweenOrderByTimestampAsc(userId, since, LocalDateTime.now());

        if (vitals.isEmpty()) return;

        // HR Resting: readings where HR < 90 (proxy for resting)
        List<Integer> restingHR = vitals.stream()
                .filter(v -> v.getHeartRate() != null && v.getHeartRate() < 90)
                .map(Vital::getHeartRate)
                .collect(Collectors.toList());
        if (!restingHR.isEmpty()) {
            saveBaseline(user, "hr_resting", restingHR.stream().mapToDouble(Integer::doubleValue));
        }

        // HR Active: readings where HR >= 90
        List<Integer> activeHR = vitals.stream()
                .filter(v -> v.getHeartRate() != null && v.getHeartRate() >= 90)
                .map(Vital::getHeartRate)
                .collect(Collectors.toList());
        if (!activeHR.isEmpty()) {
            saveBaseline(user, "hr_active", activeHR.stream().mapToDouble(Integer::doubleValue));
        }

        // SpO2
        List<Integer> spo2 = vitals.stream()
                .filter(v -> v.getSpo2() != null)
                .map(Vital::getSpo2)
                .collect(Collectors.toList());
        if (!spo2.isEmpty()) {
            saveBaseline(user, "spo2", spo2.stream().mapToDouble(Integer::doubleValue));
        }

        // Steps daily: compute daily totals
        // Group by date, compute max-min per day
        var dailySteps = vitals.stream()
                .filter(v -> v.getSteps() != null)
                .collect(Collectors.groupingBy(v -> v.getTimestamp().toLocalDate()));
        List<Double> stepDays = dailySteps.values().stream()
                .map(dayVitals -> {
                    int max = dayVitals.stream().mapToInt(Vital::getSteps).max().orElse(0);
                    int min = dayVitals.stream().mapToInt(Vital::getSteps).min().orElse(0);
                    return (double) Math.max(0, max - min);
                })
                .collect(Collectors.toList());
        if (!stepDays.isEmpty()) {
            saveBaseline(user, "steps_daily", stepDays.stream().mapToDouble(Double::doubleValue));
        }
    }

    private void saveBaseline(User user, String metric, java.util.stream.DoubleStream values) {
        double[] arr = values.toArray();
        if (arr.length == 0) return;

        DoubleSummaryStatistics stats = java.util.Arrays.stream(arr).summaryStatistics();
        double mean = stats.getAverage();
        double std = Math.sqrt(java.util.Arrays.stream(arr).map(v -> (v - mean) * (v - mean)).average().orElse(0));

        UserBaseline baseline = baselineRepo.findByUserIdAndMetric(user.getId(), metric)
                .orElseGet(() -> {
                    UserBaseline b = new UserBaseline();
                    b.setUser(user);
                    b.setMetric(metric);
                    return b;
                });

        baseline.setBaselineMean(Math.round(mean * 10.0) / 10.0);
        baseline.setBaselineStd(Math.round(std * 10.0) / 10.0);
        baseline.setBaselineMin(stats.getMin());
        baseline.setBaselineMax(stats.getMax());
        baseline.setSampleCount(arr.length);
        baseline.setLastUpdated(LocalDateTime.now());

        baselineRepo.save(baseline);
    }

    private BaselineResponse toResponse(UserBaseline b) {
        boolean personalized = b.getSampleCount() >= MIN_SAMPLES_FOR_PERSONALIZATION;
        double lower = Math.round((b.getBaselineMean() - 2 * b.getBaselineStd()) * 10.0) / 10.0;
        double upper = Math.round((b.getBaselineMean() + 2 * b.getBaselineStd()) * 10.0) / 10.0;
        return new BaselineResponse(
                b.getMetric(),
                b.getBaselineMean(),
                b.getBaselineStd(),
                b.getBaselineMin(),
                b.getBaselineMax(),
                lower,
                upper,
                b.getSampleCount(),
                personalized,
                b.getLastUpdated()
        );
    }
}
