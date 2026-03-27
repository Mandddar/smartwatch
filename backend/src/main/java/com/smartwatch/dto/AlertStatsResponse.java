package com.smartwatch.dto;

/**
 * Alert frequency per day — used for the alert stats chart.
 */
public record AlertStatsResponse(
        String date,
        Long alertCount
) {}
