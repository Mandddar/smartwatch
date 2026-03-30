package com.smartwatch.controller;

import com.smartwatch.dto.DailyReportResponse;
import com.smartwatch.dto.SummaryReportResponse;
import com.smartwatch.service.ReportsService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;

@RestController
@RequestMapping("/api/reports")
public class ReportsController {

    private final ReportsService reportsService;

    public ReportsController(ReportsService reportsService) {
        this.reportsService = reportsService;
    }

    /** GET /api/reports/daily?date=2026-03-30 — full daily health report */
    @GetMapping("/daily")
    public ResponseEntity<DailyReportResponse> dailyReport(
            Authentication auth,
            @RequestParam(required = false) String date
    ) {
        Long userId = (Long) auth.getPrincipal();
        LocalDate reportDate;
        if (date != null) {
            try {
                reportDate = LocalDate.parse(date);
            } catch (DateTimeParseException e) {
                reportDate = LocalDate.now();
            }
        } else {
            reportDate = LocalDate.now();
        }
        return ResponseEntity.ok(reportsService.getDailyReport(userId, reportDate));
    }

    /** GET /api/reports/summary?range=12h — quick summary (12h, 24h, 48h) */
    @GetMapping("/summary")
    public ResponseEntity<SummaryReportResponse> summary(
            Authentication auth,
            @RequestParam(defaultValue = "12h") String range
    ) {
        Long userId = (Long) auth.getPrincipal();
        return ResponseEntity.ok(reportsService.getSummary(userId, range));
    }
}
