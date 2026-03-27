package com.smartwatch.dto;

import java.time.LocalDateTime;

public record VitalResponse(
        Integer heartRate,
        Integer spo2,
        Integer steps,
        LocalDateTime timestamp
) {}
