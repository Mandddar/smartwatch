package com.smartwatch.scheduler;

import com.smartwatch.model.Device;
import com.smartwatch.model.NotificationPreference;
import com.smartwatch.model.User;
import com.smartwatch.model.Vital;
import com.smartwatch.model.SleepSession;
import com.smartwatch.repository.DeviceRepository;
import com.smartwatch.repository.UserRepository;
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
import java.util.List;
import java.util.Optional;
import java.util.Random;

@Component
public class VitalScheduler {

    private static final Random RANDOM = new Random();
    private static final int HR_MIN = 65;
    private static final int HR_MAX = 120;
    private static final int SPO2_MIN = 95;
    private static final int SPO2_MAX = 99;

    private final DeviceRepository deviceRepository;
    private final UserRepository userRepository;
    private final VitalService vitalService;
    private final AlertService alertService;
    private final RuleEngine ruleEngine;
    private final SleepSessionRepository sleepSessionRepository;
    private final VitalRepository vitalRepository;

    public VitalScheduler(DeviceRepository deviceRepository, UserRepository userRepository,
                          VitalService vitalService, AlertService alertService, RuleEngine ruleEngine,
                          SleepSessionRepository sleepSessionRepository, VitalRepository vitalRepository) {
        this.deviceRepository = deviceRepository;
        this.userRepository = userRepository;
        this.vitalService = vitalService;
        this.alertService = alertService;
        this.ruleEngine = ruleEngine;
        this.sleepSessionRepository = sleepSessionRepository;
        this.vitalRepository = vitalRepository;
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

            // Generate simulated vitals
            // Simulate random periods of sleep (low HR, low movement)
            boolean simulateSleep = RANDOM.nextDouble() < 0.1;
            int heartRate = simulateSleep ? (50 + RANDOM.nextInt(10)) : (HR_MIN + RANDOM.nextInt(HR_MAX - HR_MIN + 1));
            int spo2 = SPO2_MIN + RANDOM.nextInt(SPO2_MAX - SPO2_MIN + 1);
            int lastSteps = vitalService.getLastSteps(user.getId());
            int steps = simulateSleep ? lastSteps : lastSteps + 1; // 0 steps if sleeping

            LocalDateTime now = LocalDateTime.now();
            Vital vital = vitalService.saveVital(user, heartRate, spo2, steps, now);

            // Run rule engine
            NotificationPreference prefs = user.getNotificationPreference();
            boolean enableHR = prefs != null && prefs.isEnableHeartRateAlerts();
            List<RuleEngine.AlertData> alertDataList = ruleEngine.evaluate(user, vital, enableHR);

            for (RuleEngine.AlertData data : alertDataList) {
                alertService.createAlert(user, data.getMessage(), data.getSeverity());
            }

            // Sleep Detection Logic
            detectSleep(user, now);
        }
    }

    private void detectSleep(User user, LocalDateTime now) {
        List<Vital> recentVitals = vitalRepository.findByUserIdOrderByTimestampDesc(user.getId(), PageRequest.of(0, 12)); // last 1 min (12 readings)
        
        if (recentVitals.size() == 12) {
            int minHr = recentVitals.stream().mapToInt(Vital::getHeartRate).min().orElse(100);
            int maxHr = recentVitals.stream().mapToInt(Vital::getHeartRate).max().orElse(100);
            int minSteps = recentVitals.stream().mapToInt(Vital::getSteps).min().orElse(0);
            int maxSteps = recentVitals.stream().mapToInt(Vital::getSteps).max().orElse(0);
            
            boolean lowMovement = (maxSteps - minSteps) <= 2;
            boolean stableHR = (maxHr - minHr) <= 15 && avgHr(recentVitals) < 75;

            Optional<SleepSession> ongoingSessionOpt = sleepSessionRepository.findFirstByUserIdAndEndTimeIsNullOrderByStartTimeDesc(user.getId());

            if (lowMovement && stableHR) {
                if (ongoingSessionOpt.isEmpty()) {
                    SleepSession session = new SleepSession();
                    session.setUser(user);
                    session.setStartTime(now);
                    session.setQualityScore(85.0); // Basic initial score
                    sleepSessionRepository.save(session);
                }
            } else {
                if (ongoingSessionOpt.isPresent()) {
                    SleepSession session = ongoingSessionOpt.get();
                    if (session.getStartTime().isBefore(now.minusMinutes(1))) { // Only save if > 1 min
                        session.setEndTime(now);
                        // adjust quality based on duration
                        long minutes = java.time.Duration.between(session.getStartTime(), session.getEndTime()).toMinutes();
                        session.setQualityScore(Math.min(100.0, 50.0 + (minutes * 0.1)));
                        sleepSessionRepository.save(session);
                    } else {
                        sleepSessionRepository.delete(session); // too short to be sleep
                    }
                }
            }
        }
    }

    private double avgHr(List<Vital> vitals) {
        return vitals.stream().mapToInt(Vital::getHeartRate).average().orElse(100);
    }
}
