package com.smartwatch.dto;

public record PreferencesRequest(
        Boolean enableHeartRateAlerts,
        Boolean enableGeneralAlerts
) {}
