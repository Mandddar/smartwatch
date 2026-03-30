package com.smartwatch.controller;

import com.smartwatch.dto.BaselineResponse;
import com.smartwatch.service.BaselineService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/baselines")
public class BaselineController {

    private final BaselineService baselineService;

    public BaselineController(BaselineService baselineService) {
        this.baselineService = baselineService;
    }

    /** GET /api/baselines — all baselines for the authenticated user */
    @GetMapping
    public ResponseEntity<List<BaselineResponse>> getBaselines(Authentication auth) {
        Long userId = (Long) auth.getPrincipal();
        return ResponseEntity.ok(baselineService.getBaselines(userId));
    }

    /** GET /api/baselines/{metric} — specific baseline (hr_resting, spo2, etc.) */
    @GetMapping("/{metric}")
    public ResponseEntity<?> getBaseline(Authentication auth, @PathVariable String metric) {
        Long userId = (Long) auth.getPrincipal();
        BaselineResponse baseline = baselineService.getBaseline(userId, metric);
        if (baseline == null) {
            return ResponseEntity.ok(Map.of("metric", metric, "personalized", false, "message", "Not enough data yet"));
        }
        return ResponseEntity.ok(baseline);
    }

    /** GET /api/baselines/status — is the user's baseline personalized? */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus(Authentication auth) {
        Long userId = (Long) auth.getPrincipal();
        boolean personalized = baselineService.isPersonalized(userId);
        Integer threshold = baselineService.getPersonalizedHRThreshold(userId);
        return ResponseEntity.ok(Map.of(
                "personalized", personalized,
                "hrThreshold", threshold != null ? threshold : "using age-based default"
        ));
    }
}
