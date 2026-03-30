package com.smartwatch.dto;

import java.time.LocalDate;

public record DailyReportResponse(
        LocalDate date,
        HeartRateSummary heartRate,
        SpO2Summary spo2,
        StepsSummary steps,
        SleepSummary sleep,
        int alertCount
) {
    public record HeartRateSummary(
            double avg,
            int min,
            int max,
            long elevatedReadings
    ) {}

    public record SpO2Summary(
            double avg,
            int min,
            long lowReadings
    ) {}

    public record StepsSummary(
            int total,
            int activeMinutes
    ) {}

    public record SleepSummary(
            long totalMinutes,
            double qualityScore
    ) {}
}
