package com.smartwatch.controller;

import com.smartwatch.dto.PreferencesRequest;
import com.smartwatch.dto.PreferencesResponse;
import com.smartwatch.service.PreferencesService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/preferences")
public class PreferencesController {

    private final PreferencesService preferencesService;

    public PreferencesController(PreferencesService preferencesService) {
        this.preferencesService = preferencesService;
    }

    @GetMapping
    public ResponseEntity<PreferencesResponse> get(Authentication auth) {
        Long userId = (Long) auth.getPrincipal();
        return ResponseEntity.ok(preferencesService.get(userId));
    }

    @PutMapping
    public ResponseEntity<PreferencesResponse> update(
            Authentication auth,
            @RequestBody PreferencesRequest req
    ) {
        Long userId = (Long) auth.getPrincipal();
        return ResponseEntity.ok(preferencesService.update(userId, req));
    }
}
