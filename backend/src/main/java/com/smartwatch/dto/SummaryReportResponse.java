package com.smartwatch.dto;

public record SummaryReportResponse(
        String range,
        double avgHeartRate,
        double avgSpo2,
        int totalSteps,
        int alertCount,
        String trendDirection
) {}
