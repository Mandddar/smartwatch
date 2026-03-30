package com.smartwatch.dto;

public record VitalBatchResponse(
        int received,
        String syncId
) {}
