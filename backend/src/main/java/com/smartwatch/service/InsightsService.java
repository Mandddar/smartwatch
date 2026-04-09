package com.smartwatch.service;

import com.smartwatch.repository.VitalRepository;
import com.smartwatch.repository.UserRepository;
import com.smartwatch.exception.NotFoundException;
import com.smartwatch.model.Vital;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class InsightsService {

    private final VitalRepository vitalRepository;
    private final UserRepository userRepository;

    public InsightsService(VitalRepository vitalRepository, UserRepository userRepository) {
        this.vitalRepository = vitalRepository;
        this.userRepository = userRepository;
    }

    public List<String> generateInsights(Long userId) {
        if (!userRepository.existsById(userId)) throw new NotFoundException("User not found");
        List<String> insights = new ArrayList<>();

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime yesterday = now.minusDays(1);
        LocalDateTime twoDaysAgo = now.minusDays(2);
        LocalDateTime lastWeek = now.minusDays(7);

        // Fetch vitals for last 24h
        List<Vital> last24hVitals = vitalRepository.findByUserIdAndTimestampBetweenOrderByTimestampAsc(userId, yesterday, now);
        // Fetch vitals for previous 24h
        List<Vital> previous24hVitals = vitalRepository.findByUserIdAndTimestampBetweenOrderByTimestampAsc(userId, twoDaysAgo, yesterday);
        // Fetch last 7 days for weekly average
        List<Vital> weeklyVitals = vitalRepository.findByUserIdAndTimestampBetweenOrderByTimestampAsc(userId, lastWeek, now);

        if (last24hVitals.isEmpty()) {
            insights.add("Not enough data collected in the last 24 hours to generate insights.");
            return insights;
        }

        double avgHr24 = last24hVitals.stream().filter(v -> v.getHeartRate() != null).mapToInt(Vital::getHeartRate).average().orElse(0);
        double avgHrPrev24 = previous24hVitals.stream().filter(v -> v.getHeartRate() != null).mapToInt(Vital::getHeartRate).average().orElse(0);
        double avgHrWeek = weeklyVitals.stream().filter(v -> v.getHeartRate() != null).mapToInt(Vital::getHeartRate).average().orElse(0);

        if (avgHrPrev24 > 0) {
            double percentChange = ((avgHr24 - avgHrPrev24) / avgHrPrev24) * 100;
            if (percentChange > 5) {
                insights.add(String.format("Your average heart rate increased by %.1f%% compared to yesterday.", percentChange));
            } else if (percentChange < -5) {
                insights.add(String.format("Your average heart rate decreased by %.1f%% compared to yesterday.", Math.abs(percentChange)));
            } else {
                insights.add("Your heart rate has been stable compared to yesterday.");
            }
        }

        if (avgHrWeek > 0 && avgHr24 > avgHrWeek * 1.05) {
            insights.add("Your heart rate today is noticeably higher than your weekly average. Make sure to rest!");
        }

        // Abnormal readings check (HR > 100)
        long abnormalCount = last24hVitals.stream().filter(v -> v.getHeartRate() != null && v.getHeartRate() > 100).count();
        if (abnormalCount > 5) {
            insights.add(String.format("We detected %d instances of elevated heart rate (>100 bpm) in the last 24 hours.", abnormalCount));
        }

        List<Vital> stepVitals = last24hVitals.stream().filter(v -> v.getSteps() != null).toList();
        int totalSteps24h = stepVitals.size() >= 2
                ? Math.max(0, stepVitals.get(stepVitals.size() - 1).getSteps() - stepVitals.get(0).getSteps())
                : 0;
        if (totalSteps24h > 10000) {
            insights.add("Great job! You've been very active today with over 10,000 steps logged.");
        } else if (totalSteps24h < 1000) {
           insights.add("You've had low activity today. Try to take a short walk if you can.");
        }

        if (insights.isEmpty()) {
            insights.add("Your vitals look steady and normal. Keep it up!");
        }

        return insights;
    }
}
