package com.smartwatch.scheduler;

import com.smartwatch.model.Device;
import com.smartwatch.model.NotificationPreference;
import com.smartwatch.model.User;
import com.smartwatch.model.Vital;
import com.smartwatch.model.SleepSession;
import com.smartwatch.repository.DeviceRepository;
import com.smartwatch.repository.SleepSessionRepository;
import com.smartwatch.repository.VitalRepository;
import com.smartwatch.service.AlertService;
import com.smartwatch.service.RuleEngine;
import com.smartwatch.service.VitalService;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Realistic vital data simulator with:
 * - Circadian rhythm (HR lower at night, peaks afternoon)
 * - Activity states (resting, walking, running, sleeping) with smooth transitions
 * - HR-step correlation (higher HR = more steps)
 * - Exercise + recovery patterns
 * - Realistic SpO2 variance (dips during exertion/sleep)
 * - Smooth value transitions (no random jumps)
 */
@Component
public class VitalScheduler {

    private static final Random RNG = new Random();

    private final DeviceRepository deviceRepository;
    private final VitalService vitalService;
    private final AlertService alertService;
    private final RuleEngine ruleEngine;
    private final SleepSessionRepository sleepSessionRepository;
    private final VitalRepository vitalRepository;

    // Per-user simulation state for smooth transitions
    private final Map<Long, UserSimState> simStates = new ConcurrentHashMap<>();

    public VitalScheduler(DeviceRepository deviceRepository,
                          VitalService vitalService, AlertService alertService, RuleEngine ruleEngine,
                          SleepSessionRepository sleepSessionRepository, VitalRepository vitalRepository) {
        this.deviceRepository = deviceRepository;
        this.vitalService = vitalService;
        this.alertService = alertService;
        this.ruleEngine = ruleEngine;
        this.sleepSessionRepository = sleepSessionRepository;
        this.vitalRepository = vitalRepository;
    }

    enum Activity { SLEEPING, RESTING, WALKING, RUNNING, RECOVERING }

    static class UserSimState {
        Activity activity = Activity.RESTING;
        double hr = 72;
        double spo2 = 97.5;
        int steps;
        int ticksInActivity = 0;
        int activityDuration = 60;  // ticks until next transition
        double exerciseIntensity = 0; // 0-1, decays during recovery
        int lastResetDay = -1; // day-of-year when steps were last reset

        UserSimState(int lastSteps) {
            this.steps = lastSteps;
            this.lastResetDay = LocalDateTime.now().getDayOfYear();
        }
    }

    @Scheduled(fixedRate = 5000)
    @Transactional
    public void generateVitals() {
        List<Device> connected = deviceRepository.findAll().stream()
                .filter(d -> d.getStatus() == Device.Status.CONNECTED)
                .toList();

        for (Device device : connected) {
            User user = device.getUser();
            if (user == null) continue;

            int lastSteps = vitalService.getLastSteps(user.getId());
            UserSimState state = simStates.computeIfAbsent(user.getId(), k -> new UserSimState(lastSteps));

            LocalDateTime now = LocalDateTime.now();

            // Reset steps at midnight
            int today = now.getDayOfYear();
            if (state.lastResetDay != today) {
                state.steps = 0;
                state.lastResetDay = today;
            }

            updateActivity(state, now);
            simulateVitals(state, now);

            int heartRate = (int) Math.round(state.hr);
            int spo2 = (int) Math.round(state.spo2);
            int steps = state.steps;

            Vital vital = vitalService.saveVital(user, heartRate, spo2, steps, now);

            // Run rule engine
            NotificationPreference prefs = user.getNotificationPreference();
            boolean enableHR = prefs != null && prefs.isEnableHeartRateAlerts();
            List<RuleEngine.AlertData> alertDataList = ruleEngine.evaluate(user, vital, enableHR);

            for (RuleEngine.AlertData data : alertDataList) {
                alertService.createAlert(user, data.getMessage(), data.getSeverity());
            }

            detectSleep(user, now);
        }
    }

    /**
     * Transition between activity states with realistic timing.
     * Night hours favor sleeping; daytime has mix of rest/walk/run.
     */
    private void updateActivity(UserSimState s, LocalDateTime now) {
        s.ticksInActivity++;
        if (s.ticksInActivity < s.activityDuration) return;

        // Transition to new activity
        int hour = now.getHour();
        boolean isNight = hour >= 23 || hour < 6;
        boolean isEarlyMorning = hour >= 6 && hour < 8;
        boolean isEvening = hour >= 20 && hour < 23;

        double roll = RNG.nextDouble();

        if (isNight) {
            // Night: 85% sleep, 10% resting, 5% walking (bathroom)
            s.activity = roll < 0.85 ? Activity.SLEEPING : roll < 0.95 ? Activity.RESTING : Activity.WALKING;
            s.activityDuration = Activity.SLEEPING == s.activity ? 120 + RNG.nextInt(240) : 6 + RNG.nextInt(12);
        } else if (isEarlyMorning || isEvening) {
            // Transition periods: more resting, some walking
            s.activity = roll < 0.50 ? Activity.RESTING : roll < 0.85 ? Activity.WALKING : roll < 0.93 ? Activity.RUNNING : Activity.SLEEPING;
            s.activityDuration = 12 + RNG.nextInt(60);
        } else {
            // Daytime: active mix
            if (s.activity == Activity.RUNNING) {
                // After running, always recover
                s.activity = Activity.RECOVERING;
                s.exerciseIntensity = 0.8 + RNG.nextDouble() * 0.2;
                s.activityDuration = 12 + RNG.nextInt(24); // 1-3 min recovery
            } else {
                s.activity = roll < 0.35 ? Activity.RESTING
                           : roll < 0.70 ? Activity.WALKING
                           : roll < 0.85 ? Activity.RUNNING
                           : Activity.RESTING;
                s.activityDuration = s.activity == Activity.RUNNING ? 12 + RNG.nextInt(36) // 1-4 min run
                                   : s.activity == Activity.WALKING ? 24 + RNG.nextInt(72) // 2-8 min walk
                                   : 24 + RNG.nextInt(120); // 2-12 min rest
            }
        }
        s.ticksInActivity = 0;
    }

    /**
     * Simulate vitals with smooth transitions based on activity and circadian rhythm.
     */
    private void simulateVitals(UserSimState s, LocalDateTime now) {
        // Circadian rhythm: HR offset based on time of day
        // Lower at 3-5 AM, peaks at 2-4 PM
        double hourFrac = now.getHour() + now.getMinute() / 60.0;
        double circadianOffset = -6 * Math.cos(2 * Math.PI * (hourFrac - 14) / 24.0);
        // Range: approx -6 to +6 bpm

        // Target HR based on activity
        double targetHR;
        double targetSpo2;
        int stepIncrement = 0;

        switch (s.activity) {
            case SLEEPING:
                targetHR = 52 + RNG.nextGaussian() * 2 + circadianOffset * 0.5;
                targetSpo2 = 95.5 + RNG.nextGaussian() * 1.0; // SpO2 dips during sleep
                stepIncrement = 0;
                break;
            case RESTING:
                targetHR = 68 + RNG.nextGaussian() * 3 + circadianOffset;
                targetSpo2 = 97.5 + RNG.nextGaussian() * 0.5;
                stepIncrement = RNG.nextDouble() < 0.1 ? 1 : 0; // occasional fidget
                break;
            case WALKING:
                targetHR = 90 + RNG.nextGaussian() * 5 + circadianOffset;
                targetSpo2 = 97.0 + RNG.nextGaussian() * 0.6;
                stepIncrement = 8 + RNG.nextInt(6); // ~8-13 steps per 5s (~100-150 steps/min)
                break;
            case RUNNING:
                targetHR = 145 + RNG.nextGaussian() * 10 + circadianOffset;
                targetSpo2 = 95.0 + RNG.nextGaussian() * 1.2; // SpO2 drops under exertion
                stepIncrement = 18 + RNG.nextInt(8); // ~18-25 steps per 5s (~200-300 steps/min)
                break;
            case RECOVERING:
                // HR decays from exercise level back toward resting
                s.exerciseIntensity *= 0.85; // exponential decay
                targetHR = 68 + s.exerciseIntensity * 70 + RNG.nextGaussian() * 3 + circadianOffset;
                targetSpo2 = 96.5 + (1 - s.exerciseIntensity) * 1.5 + RNG.nextGaussian() * 0.5;
                stepIncrement = (int) (s.exerciseIntensity * 4); // slowing down
                if (s.exerciseIntensity < 0.05) {
                    s.activity = Activity.RESTING;
                }
                break;
            default:
                targetHR = 72;
                targetSpo2 = 97.5;
        }

        // Smooth transition: move 20-30% toward target each tick (no jumps)
        double smoothing = 0.2 + RNG.nextDouble() * 0.1;
        s.hr += (targetHR - s.hr) * smoothing;
        s.spo2 += (targetSpo2 - s.spo2) * smoothing;

        // Clamp to physiological bounds
        s.hr = Math.max(42, Math.min(190, s.hr));
        s.spo2 = Math.max(88, Math.min(100, s.spo2));
        s.steps += stepIncrement;
    }

    private void detectSleep(User user, LocalDateTime now) {
        List<Vital> recentVitals = vitalRepository.findByUserIdOrderByTimestampDesc(
                user.getId(), PageRequest.of(0, 24)); // last 2 min

        if (recentVitals.size() >= 12) {
            double avgHr = avgHr(recentVitals);
            int maxSteps = recentVitals.stream().mapToInt(Vital::getSteps).max().orElse(0);
            int minSteps = recentVitals.stream().mapToInt(Vital::getSteps).min().orElse(0);

            boolean lowMovement = (maxSteps - minSteps) <= 3;
            boolean lowHR = avgHr < 65;

            Optional<SleepSession> ongoingOpt = sleepSessionRepository
                    .findFirstByUserIdAndEndTimeIsNullOrderByStartTimeDesc(user.getId());

            // Cap sleep at 12 hours — auto-end stale sessions
            if (ongoingOpt.isPresent()) {
                long ongoingMinutes = java.time.Duration.between(ongoingOpt.get().getStartTime(), now).toMinutes();
                if (ongoingMinutes >= 720) { // 12 hours max
                    SleepSession session = ongoingOpt.get();
                    session.setEndTime(now);
                    double durationScore = Math.min(40, ongoingMinutes * 0.1);
                    double hrStability = 30 - Math.min(30, avgHr - 50);
                    session.setQualityScore(Math.min(100, 30 + durationScore + hrStability));
                    sleepSessionRepository.save(session);
                    ongoingOpt = Optional.empty();
                }
            }

            if (lowMovement && lowHR) {
                if (ongoingOpt.isEmpty()) {
                    SleepSession session = new SleepSession();
                    session.setUser(user);
                    session.setStartTime(now);
                    session.setQualityScore(0); // computed on end
                    sleepSessionRepository.save(session);
                }
            } else {
                if (ongoingOpt.isPresent()) {
                    SleepSession session = ongoingOpt.get();
                    long minutes = java.time.Duration.between(session.getStartTime(), now).toMinutes();
                    if (minutes >= 5) {
                        session.setEndTime(now);
                        // Quality based on duration + HR stability
                        double durationScore = Math.min(40, minutes * 0.1); // up to 40 pts for 6+ hrs
                        double hrStability = 30 - Math.min(30, avgHr - 50); // lower avg HR = better
                        double baseScore = 30; // baseline
                        session.setQualityScore(Math.min(100, baseScore + durationScore + hrStability));
                        sleepSessionRepository.save(session);
                    } else {
                        sleepSessionRepository.delete(session); // too short
                    }
                }
            }
        }
    }

    private double avgHr(List<Vital> vitals) {
        return vitals.stream().mapToInt(Vital::getHeartRate).average().orElse(100);
    }
}
