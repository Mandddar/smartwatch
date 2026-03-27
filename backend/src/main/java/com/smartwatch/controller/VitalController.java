package com.smartwatch.controller;

import com.smartwatch.dto.VitalAggregateResponse;
import com.smartwatch.dto.VitalResponse;
import com.smartwatch.exception.BadRequestException;
import com.smartwatch.service.VitalService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/vitals")
public class VitalController {

    private final VitalService vitalService;

    public VitalController(VitalService vitalService) {
        this.vitalService = vitalService;
    }

    @GetMapping("/latest")
    public ResponseEntity<?> latest(Authentication auth) {
        Long userId = (Long) auth.getPrincipal();
        return vitalService.getLatest(userId)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> {
                    Map<String, Object> empty = new HashMap<>();
                    empty.put("heartRate", null);
                    empty.put("spo2", null);
                    empty.put("steps", null);
                    empty.put("timestamp", null);
                    empty.put("message", "No vitals yet. Connect device to start.");
                    return ResponseEntity.ok(empty);
                });
    }

    @GetMapping("/history")
    public ResponseEntity<List<VitalResponse>> history(
            Authentication auth,
            @RequestParam(defaultValue = "20") int limit
    ) {
        Long userId = (Long) auth.getPrincipal();
        return ResponseEntity.ok(vitalService.getHistory(userId, Math.min(limit, 100)));
    }

    /** GET /api/vitals?from={ISO}&to={ISO} — raw vitals in a time range */
    @GetMapping
    public ResponseEntity<List<VitalResponse>> range(
            Authentication auth,
            @RequestParam String from,
            @RequestParam String to
    ) {
        Long userId = (Long) auth.getPrincipal();
        try {
            LocalDateTime fromDt = LocalDateTime.parse(from);
            LocalDateTime toDt = LocalDateTime.parse(to);
            if (fromDt.isAfter(toDt)) {
                throw new BadRequestException("'from' must be before 'to'");
            }
            return ResponseEntity.ok(vitalService.getRange(userId, fromDt, toDt));
        } catch (DateTimeParseException e) {
            throw new BadRequestException("Invalid date format. Use ISO-8601 (e.g. 2026-03-02T10:00:00)");
        }
    }

    /** GET /api/vitals/aggregate?type=hourly|daily — bucketed averages */
    @GetMapping("/aggregate")
    public ResponseEntity<List<VitalAggregateResponse>> aggregate(
            Authentication auth,
            @RequestParam String type
    ) {
        Long userId = (Long) auth.getPrincipal();
        return switch (type.toLowerCase()) {
            case "hourly" -> ResponseEntity.ok(vitalService.getHourlyAggregate(userId));
            case "daily" -> ResponseEntity.ok(vitalService.getDailyAggregate(userId));
            default -> throw new BadRequestException("Invalid type. Use 'hourly' or 'daily'");
        };
    }

    @GetMapping("/trends")
    public ResponseEntity<?> getVitalsTrends(Authentication auth, @RequestParam(defaultValue = "weekly") String range) {
        Long userId = (Long) auth.getPrincipal();
        return ResponseEntity.ok(vitalService.getVitalsTrends(userId, range));
    }

    @GetMapping("/sleep/latest")
    public ResponseEntity<?> getLatestSleep(Authentication auth, @org.springframework.beans.factory.annotation.Autowired com.smartwatch.repository.SleepSessionRepository sleepSessionRepository) {
        Long userId = (Long) auth.getPrincipal();
        return sleepSessionRepository.findFirstByUserIdOrderByStartTimeDesc(userId)
                .map(s -> ResponseEntity.ok(new com.smartwatch.dto.SleepSessionResponse(s.getId(), s.getStartTime(), s.getEndTime(), s.getQualityScore())))
                .orElse(ResponseEntity.noContent().build());
    }
}
