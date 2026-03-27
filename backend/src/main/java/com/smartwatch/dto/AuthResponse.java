package com.smartwatch.dto;

public record AuthResponse(String token, String email, Long userId) {}
