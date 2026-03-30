package com.smartwatch.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDateTime;
import java.util.List;

public record VitalBatchRequest(
        @NotEmpty List<@Valid Reading> readings
) {
    public record Reading(
            @NotNull Integer heartRate,
            @NotNull Integer spo2,
            @NotNull Integer steps,
            @NotNull LocalDateTime timestamp
    ) {}
}
