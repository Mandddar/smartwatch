package com.smartwatch.model;

import jakarta.persistence.*;

/**
 * User notification preferences.
 * enableHeartRateAlerts: 85% maxHR rule.
 * enableGeneralAlerts: other health alerts.
 */
@Entity
@Table(name = "notification_preferences")
public class NotificationPreference {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private boolean enableHeartRateAlerts = true;

    @Column(nullable = false)
    private boolean enableGeneralAlerts = true;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public boolean isEnableHeartRateAlerts() { return enableHeartRateAlerts; }
    public void setEnableHeartRateAlerts(boolean v) { this.enableHeartRateAlerts = v; }
    public boolean isEnableGeneralAlerts() { return enableGeneralAlerts; }
    public void setEnableGeneralAlerts(boolean v) { this.enableGeneralAlerts = v; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
}
