package com.smartwatch.dto;

import java.time.LocalDateTime;

public record AlertResponse(
        Long id,
        String message,
        LocalDateTime timestamp,
        boolean read,
        String severity
) {}
