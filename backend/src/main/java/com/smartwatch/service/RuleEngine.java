package com.smartwatch.service;

import com.smartwatch.model.Alert;
import com.smartwatch.model.User;
import com.smartwatch.model.Vital;
import com.smartwatch.repository.VitalRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.Period;
import java.util.ArrayList;
import java.util.List;

@Service
public class RuleEngine {

    private static final double HR_THRESHOLD_PERCENT = 0.85;
    private static final int SUSTAINED_READINGS = 3;

    private final VitalRepository vitalRepository;
    private final BaselineService baselineService;

    public RuleEngine(VitalRepository vitalRepository, BaselineService baselineService) {
        this.vitalRepository = vitalRepository;
        this.baselineService = baselineService;
    }

    public static class AlertData {
        private String message;
        private Alert.Severity severity;

        public AlertData(String message, Alert.Severity severity) {
            this.message = message;
            this.severity = severity;
        }

        public String getMessage() { return message; }
        public Alert.Severity getSeverity() { return severity; }
    }

    public List<AlertData> evaluate(User user, Vital vital, boolean enableHeartRateAlerts) {
        List<AlertData> alerts = new ArrayList<>();
        if (vital == null) return alerts;

        // Try personalized threshold first, fall back to age-based
        Integer personalThreshold = baselineService.getPersonalizedHRThreshold(user.getId());
        int threshold;
        String thresholdSource;

        if (personalThreshold != null) {
            threshold = personalThreshold;
            thresholdSource = "personal baseline";
        } else {
            int age = calculateAge(user.getDateOfBirth());
            int maxHR = 220 - age;
            threshold = (int) (maxHR * HR_THRESHOLD_PERCENT);
            thresholdSource = "age-based (220-age)";
        }

        if (enableHeartRateAlerts && vital.getHeartRate() != null && vital.getHeartRate() > threshold) {
            List<Vital> recentVitals = vitalRepository.findByUserIdOrderByTimestampDesc(user.getId(), PageRequest.of(0, SUSTAINED_READINGS));
            boolean sustained = recentVitals.size() >= SUSTAINED_READINGS &&
                    recentVitals.stream().allMatch(v -> v.getHeartRate() != null && v.getHeartRate() > threshold);

            if (sustained) {
                Alert.Severity severity = Alert.Severity.LOW;
                if (vital.getHeartRate() > threshold + 30) severity = Alert.Severity.CRITICAL;
                else if (vital.getHeartRate() > threshold + 15) severity = Alert.Severity.MEDIUM;

                alerts.add(new AlertData(
                        String.format("Sustained elevated heart rate: %d bpm (threshold: %d bpm, %s)",
                                vital.getHeartRate(), threshold, thresholdSource),
                        severity
                ));
            }
        }

        return alerts;
    }

    private int calculateAge(LocalDate dob) {
        return Period.between(dob, LocalDate.now()).getYears();
    }
}
