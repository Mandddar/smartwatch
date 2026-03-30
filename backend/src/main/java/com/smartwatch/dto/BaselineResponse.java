package com.smartwatch.dto;

import java.time.LocalDateTime;

public record BaselineResponse(
        String metric,
        double mean,
        double std,
        double min,
        double max,
        double lowerBound,
        double upperBound,
        int sampleCount,
        boolean personalized,
        LocalDateTime lastUpdated
) {}
