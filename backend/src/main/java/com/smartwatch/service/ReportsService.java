package com.smartwatch.service;

import com.smartwatch.dto.DailyReportResponse;
import com.smartwatch.dto.SummaryReportResponse;
import com.smartwatch.exception.NotFoundException;
import com.smartwatch.model.SleepSession;
import com.smartwatch.model.Vital;
import com.smartwatch.repository.AlertRepository;
import com.smartwatch.repository.SleepSessionRepository;
import com.smartwatch.repository.UserRepository;
import com.smartwatch.repository.VitalRepository;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

@Service
public class ReportsService {

    private final VitalRepository vitalRepository;
    private final AlertRepository alertRepository;
    private final SleepSessionRepository sleepSessionRepository;
    private final UserRepository userRepository;

    public ReportsService(VitalRepository vitalRepository, AlertRepository alertRepository,
                          SleepSessionRepository sleepSessionRepository, UserRepository userRepository) {
        this.vitalRepository = vitalRepository;
        this.alertRepository = alertRepository;
        this.sleepSessionRepository = sleepSessionRepository;
        this.userRepository = userRepository;
    }

    public DailyReportResponse getDailyReport(Long userId, LocalDate date) {
        if (!userRepository.existsById(userId)) throw new NotFoundException("User not found");

        LocalDateTime start = date.atStartOfDay();
        LocalDateTime end = date.atTime(LocalTime.MAX);

        List<Vital> vitals = vitalRepository.findByUserIdAndTimestampBetweenOrderByTimestampAsc(userId, start, end);

        // Heart rate summary
        DailyReportResponse.HeartRateSummary hrSummary;
        if (vitals.isEmpty()) {
            hrSummary = new DailyReportResponse.HeartRateSummary(0, 0, 0, 0);
        } else {
            double avgHr = vitals.stream().mapToInt(Vital::getHeartRate).average().orElse(0);
            int minHr = vitals.stream().mapToInt(Vital::getHeartRate).min().orElse(0);
            int maxHr = vitals.stream().mapToInt(Vital::getHeartRate).max().orElse(0);
            long elevated = vitals.stream().filter(v -> v.getHeartRate() > 100).count();
            hrSummary = new DailyReportResponse.HeartRateSummary(
                    Math.round(avgHr * 10.0) / 10.0, minHr, maxHr, elevated);
        }

        // SpO2 summary
        DailyReportResponse.SpO2Summary spo2Summary;
        if (vitals.isEmpty()) {
            spo2Summary = new DailyReportResponse.SpO2Summary(0, 0, 0);
        } else {
            double avgSpo2 = vitals.stream().mapToInt(Vital::getSpo2).average().orElse(0);
            int minSpo2 = vitals.stream().mapToInt(Vital::getSpo2).min().orElse(0);
            long lowReadings = vitals.stream().filter(v -> v.getSpo2() < 95).count();
            spo2Summary = new DailyReportResponse.SpO2Summary(
                    Math.round(avgSpo2 * 10.0) / 10.0, minSpo2, lowReadings);
        }

        // Steps summary
        DailyReportResponse.StepsSummary stepsSummary;
        if (vitals.isEmpty()) {
            stepsSummary = new DailyReportResponse.StepsSummary(0, 0);
        } else {
            int totalSteps = vitals.get(vitals.size() - 1).getSteps() - vitals.get(0).getSteps();
            totalSteps = Math.max(0, totalSteps);
            // Estimate active minutes: count 5-second intervals where steps incremented
            int activeIntervals = 0;
            for (int i = 1; i < vitals.size(); i++) {
                if (vitals.get(i).getSteps() > vitals.get(i - 1).getSteps()) {
                    activeIntervals++;
                }
            }
            int activeMinutes = activeIntervals * 5 / 60; // 5-second intervals to minutes
            stepsSummary = new DailyReportResponse.StepsSummary(totalSteps, activeMinutes);
        }

        // Sleep summary
        List<SleepSession> sleepSessions = sleepSessionRepository.findByUserIdOrderByStartTimeDesc(userId);
        long totalSleepMinutes = 0;
        double sleepQuality = 0;
        int sleepCount = 0;
        for (SleepSession s : sleepSessions) {
            if (s.getStartTime().toLocalDate().equals(date) ||
                (s.getEndTime() != null && s.getEndTime().toLocalDate().equals(date))) {
                if (s.getEndTime() != null) {
                    totalSleepMinutes += Duration.between(s.getStartTime(), s.getEndTime()).toMinutes();
                }
                sleepQuality += s.getQualityScore();
                sleepCount++;
            }
        }
        DailyReportResponse.SleepSummary sleepSummary = new DailyReportResponse.SleepSummary(
                totalSleepMinutes, sleepCount > 0 ? Math.round(sleepQuality / sleepCount * 10.0) / 10.0 : 0);

        // Alert count
        int alertCount = (int) alertRepository.findByUserIdOrderByTimestampDesc(userId).stream()
                .filter(a -> a.getTimestamp().toLocalDate().equals(date))
                .count();

        return new DailyReportResponse(date, hrSummary, spo2Summary, stepsSummary, sleepSummary, alertCount);
    }

    public SummaryReportResponse getSummary(Long userId, String range) {
        if (!userRepository.existsById(userId)) throw new NotFoundException("User not found");

        int hours = switch (range) {
            case "12h" -> 12;
            case "24h" -> 24;
            case "48h" -> 48;
            default -> 12;
        };

        LocalDateTime since = LocalDateTime.now().minusHours(hours);
        List<Vital> vitals = vitalRepository.findByUserIdAndTimestampBetweenOrderByTimestampAsc(
                userId, since, LocalDateTime.now());

        if (vitals.isEmpty()) {
            return new SummaryReportResponse(range, 0, 0, 0, 0, "stable");
        }

        double avgHr = vitals.stream().mapToInt(Vital::getHeartRate).average().orElse(0);
        double avgSpo2 = vitals.stream().mapToInt(Vital::getSpo2).average().orElse(0);
        int totalSteps = Math.max(0, vitals.get(vitals.size() - 1).getSteps() - vitals.get(0).getSteps());

        int alertCount = (int) alertRepository.findByUserIdOrderByTimestampDesc(userId).stream()
                .filter(a -> a.getTimestamp().isAfter(since))
                .count();

        // Simple trend: compare first half avg HR to second half
        int mid = vitals.size() / 2;
        double firstHalfAvg = vitals.subList(0, mid).stream().mapToInt(Vital::getHeartRate).average().orElse(0);
        double secondHalfAvg = vitals.subList(mid, vitals.size()).stream().mapToInt(Vital::getHeartRate).average().orElse(0);
        String trend;
        if (firstHalfAvg > 0 && secondHalfAvg > firstHalfAvg * 1.05) trend = "increasing";
        else if (firstHalfAvg > 0 && secondHalfAvg < firstHalfAvg * 0.95) trend = "decreasing";
        else trend = "stable";

        return new SummaryReportResponse(
                range,
                Math.round(avgHr * 10.0) / 10.0,
                Math.round(avgSpo2 * 10.0) / 10.0,
                totalSteps,
                alertCount,
                trend
        );
    }
}
