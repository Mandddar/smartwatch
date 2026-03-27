package com.smartwatch.controller;

import com.smartwatch.model.Device;
import com.smartwatch.service.DeviceService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/device")
public class DeviceController {

    private final DeviceService deviceService;

    public DeviceController(DeviceService deviceService) {
        this.deviceService = deviceService;
    }

    @PostMapping("/connect")
    public ResponseEntity<Map<String, String>> connect(Authentication auth) {
        Long userId = (Long) auth.getPrincipal();
        deviceService.connect(userId);
        return ResponseEntity.ok(Map.of("status", "CONNECTED"));
    }

    @PostMapping("/disconnect")
    public ResponseEntity<Map<String, String>> disconnect(Authentication auth) {
        Long userId = (Long) auth.getPrincipal();
        deviceService.disconnect(userId);
        return ResponseEntity.ok(Map.of("status", "DISCONNECTED"));
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, String>> status(Authentication auth) {
        Long userId = (Long) auth.getPrincipal();
        Device.Status status = deviceService.getStatus(userId);
        return ResponseEntity.ok(Map.of("status", status.name()));
    }
}
