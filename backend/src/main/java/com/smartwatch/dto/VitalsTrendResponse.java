package com.smartwatch.dto;

import java.util.List;

public class VitalsTrendResponse {
    private double avgHeartRate;
    private int minHeartRate;
    private int maxHeartRate;
    private String trendDirection;
    private List<VitalAggregateResponse> dailyData;

    public double getAvgHeartRate() { return avgHeartRate; }
    public void setAvgHeartRate(double avgHeartRate) { this.avgHeartRate = avgHeartRate; }
    public int getMinHeartRate() { return minHeartRate; }
    public void setMinHeartRate(int minHeartRate) { this.minHeartRate = minHeartRate; }
    public int getMaxHeartRate() { return maxHeartRate; }
    public void setMaxHeartRate(int maxHeartRate) { this.maxHeartRate = maxHeartRate; }
    public String getTrendDirection() { return trendDirection; }
    public void setTrendDirection(String trendDirection) { this.trendDirection = trendDirection; }
    public List<VitalAggregateResponse> getDailyData() { return dailyData; }
    public void setDailyData(List<VitalAggregateResponse> dailyData) { this.dailyData = dailyData; }
}
