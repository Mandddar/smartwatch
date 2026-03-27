package com.smartwatch.dto;

import java.time.LocalDateTime;

public record SleepSessionResponse(
        Long id,
        LocalDateTime startTime,
        LocalDateTime endTime,
        double qualityScore
) {}
