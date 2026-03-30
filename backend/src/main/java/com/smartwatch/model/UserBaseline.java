package com.smartwatch.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Stores per-user adaptive baselines for each health metric.
 * Baselines are computed from the user's own data (EWMA over 14 days)
 * and replace fixed population thresholds for personalized alerts/scoring.
 */
@Entity
@Table(name = "user_baselines", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "metric"}))
public class UserBaseline {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 50)
    private String metric; // hr_resting, hr_active, spo2, hrv_rmssd, steps_daily

    @Column(nullable = false)
    private double baselineMean;

    @Column(nullable = false)
    private double baselineStd;

    @Column(nullable = false)
    private double baselineMin;

    @Column(nullable = false)
    private double baselineMax;

    @Column(nullable = false)
    private int sampleCount;

    @Column(nullable = false)
    private LocalDateTime lastUpdated = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getMetric() { return metric; }
    public void setMetric(String metric) { this.metric = metric; }
    public double getBaselineMean() { return baselineMean; }
    public void setBaselineMean(double baselineMean) { this.baselineMean = baselineMean; }
    public double getBaselineStd() { return baselineStd; }
    public void setBaselineStd(double baselineStd) { this.baselineStd = baselineStd; }
    public double getBaselineMin() { return baselineMin; }
    public void setBaselineMin(double baselineMin) { this.baselineMin = baselineMin; }
    public double getBaselineMax() { return baselineMax; }
    public void setBaselineMax(double baselineMax) { this.baselineMax = baselineMax; }
    public int getSampleCount() { return sampleCount; }
    public void setSampleCount(int sampleCount) { this.sampleCount = sampleCount; }
    public LocalDateTime getLastUpdated() { return lastUpdated; }
    public void setLastUpdated(LocalDateTime lastUpdated) { this.lastUpdated = lastUpdated; }
}
