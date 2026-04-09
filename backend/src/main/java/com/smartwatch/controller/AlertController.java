package com.smartwatch.controller;

import com.smartwatch.dto.AlertResponse;
import com.smartwatch.dto.AlertStatsResponse;
import com.smartwatch.exception.BadRequestException;
import com.smartwatch.service.AlertService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/alerts")
public class AlertController {

    private final AlertService alertService;

    public AlertController(AlertService alertService) {
        this.alertService = alertService;
    }

    @GetMapping
    public ResponseEntity<List<AlertResponse>> getAlerts(Authentication auth) {
        Long userId = (Long) auth.getPrincipal();
        return ResponseEntity.ok(alertService.getAlerts(userId));
    }

    @GetMapping("/unread-count")
    public ResponseEntity<Map<String, Long>> getUnreadCount(Authentication auth) {
        Long userId = (Long) auth.getPrincipal();
        return ResponseEntity.ok(Map.of("count", alertService.getUnreadCount(userId)));
    }

    @PatchMapping("/{id}/read")
    public ResponseEntity<AlertResponse> markAsRead(Authentication auth, @PathVariable Long id) {
        Long userId = (Long) auth.getPrincipal();
        return ResponseEntity.ok(alertService.markAsRead(userId, id));
    }

    @PostMapping("/mark-all-read")
    public ResponseEntity<Void> markAllAsRead(Authentication auth) {
        Long userId = (Long) auth.getPrincipal();
        alertService.markAllAsRead(userId);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteAlert(Authentication auth, @PathVariable Long id) {
        Long userId = (Long) auth.getPrincipal();
        alertService.deleteAlert(userId, id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/stats")
    public ResponseEntity<List<AlertStatsResponse>> getAlertStats(
            Authentication auth,
            @RequestParam(defaultValue = "7d") String range
    ) {
        Long userId = (Long) auth.getPrincipal();
        int days = parseRangeDays(range);
        return ResponseEntity.ok(alertService.getAlertStats(userId, days));
    }

    private int parseRangeDays(String range) {
        if (range == null || range.isBlank()) return 7;
        String trimmed = range.trim().toLowerCase();
        if (trimmed.endsWith("d")) {
            try {
                int days = Integer.parseInt(trimmed.substring(0, trimmed.length() - 1));
                if (days < 1 || days > 90) throw new BadRequestException("Range must be between 1d and 90d");
                return days;
            } catch (NumberFormatException e) {
                throw new BadRequestException("Invalid range format. Use e.g. '7d'");
            }
        }
        throw new BadRequestException("Invalid range format. Use e.g. '7d'");
    }
}
