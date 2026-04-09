package com.smartwatch.service;

import com.smartwatch.dto.AlertResponse;
import com.smartwatch.dto.AlertStatsResponse;
import com.smartwatch.model.Alert;
import com.smartwatch.model.User;
import com.smartwatch.repository.AlertRepository;
import com.smartwatch.repository.UserRepository;
import com.smartwatch.exception.NotFoundException;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class AlertService {

    private final AlertRepository alertRepository;
    private final UserRepository userRepository;

    public AlertService(AlertRepository alertRepository, UserRepository userRepository) {
        this.alertRepository = alertRepository;
        this.userRepository = userRepository;
    }

    public List<AlertResponse> getAlerts(Long userId) {
        if (!userRepository.existsById(userId)) throw new NotFoundException("User not found");
        return alertRepository.findByUserIdOrderByTimestampDesc(userId)
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public List<AlertStatsResponse> getAlertStats(Long userId, int days) {
        if (!userRepository.existsById(userId)) throw new NotFoundException("User not found");
        LocalDateTime since = LocalDateTime.now().minusDays(days);
        return alertRepository.countByDay(userId, since)
                .stream()
                .map(row -> {
                    String date = row[0].toString();
                    Long count = ((Number) row[1]).longValue();
                    return new AlertStatsResponse(date, count);
                })
                .collect(Collectors.toList());
    }

    public Alert createAlert(User user, String message, Alert.Severity severity) {
        // Cooldown: avoid duplicate alerts within 10 minutes
        LocalDateTime tenMinsAgo = LocalDateTime.now().minusMinutes(10);
        List<Alert> recentAlerts = alertRepository.findByUserIdOrderByTimestampDesc(user.getId());
        
        boolean hasRecentAlert = recentAlerts.stream()
            .anyMatch(a -> a.getTimestamp().isAfter(tenMinsAgo) && a.getMessage().equals(message));
        
        if (hasRecentAlert) {
            return null; // Skip duplicate
        }

        Alert a = new Alert();
        a.setUser(user);
        a.setMessage(message);
        a.setSeverity(severity);
        return alertRepository.save(a);
    }

    public AlertResponse markAsRead(Long userId, Long alertId) {
        Alert alert = alertRepository.findById(alertId)
                .orElseThrow(() -> new NotFoundException("Alert not found"));
        if (!alert.getUser().getId().equals(userId)) throw new NotFoundException("Alert not found");
        alert.setRead(true);
        return toResponse(alertRepository.save(alert));
    }

    public void markAllAsRead(Long userId) {
        List<Alert> alerts = alertRepository.findByUserIdOrderByTimestampDesc(userId);
        alerts.stream().filter(a -> !a.isRead()).forEach(a -> a.setRead(true));
        alertRepository.saveAll(alerts);
    }

    public void deleteAlert(Long userId, Long alertId) {
        Alert alert = alertRepository.findById(alertId)
                .orElseThrow(() -> new NotFoundException("Alert not found"));
        if (!alert.getUser().getId().equals(userId)) throw new NotFoundException("Alert not found");
        alertRepository.delete(alert);
    }

    public long getUnreadCount(Long userId) {
        return alertRepository.countByUserIdAndReadFalse(userId);
    }

    private AlertResponse toResponse(Alert a) {
        return new AlertResponse(a.getId(), a.getMessage(), a.getTimestamp(), a.isRead(), a.getSeverity().name());
    }
}
