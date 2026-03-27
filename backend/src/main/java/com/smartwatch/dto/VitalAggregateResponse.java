package com.smartwatch.dto;

import java.time.LocalDateTime;

/**
 * Aggregated vitals bucket — used for hourly/daily analytics charts.
 */
public record VitalAggregateResponse(
        LocalDateTime bucket,
        Double avgHeartRate,
        Double avgSpO2,
        Long totalSteps
) {}
