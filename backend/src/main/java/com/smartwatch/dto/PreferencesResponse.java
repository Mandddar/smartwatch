package com.smartwatch.dto;

public record PreferencesResponse(
        boolean enableHeartRateAlerts,
        boolean enableGeneralAlerts
) {}
