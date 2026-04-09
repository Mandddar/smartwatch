package com.smartwatch.controller;

import com.smartwatch.dto.InsightsResponse;
import com.smartwatch.service.InsightsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/insights")
public class InsightsController {

    private final InsightsService insightsService;

    public InsightsController(InsightsService insightsService) {
        this.insightsService = insightsService;
    }

    @GetMapping("/summary")
    public ResponseEntity<InsightsResponse> getInsightsSummary(org.springframework.security.core.Authentication auth) {
        Long userId = (Long) auth.getPrincipal();
        return ResponseEntity.ok(new InsightsResponse(insightsService.generateInsights(userId)));
    }
}
