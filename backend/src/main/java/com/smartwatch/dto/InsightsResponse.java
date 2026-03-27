package com.smartwatch.dto;

import java.util.List;

public class InsightsResponse {
    private List<String> insights;

    public InsightsResponse() {}

    public InsightsResponse(List<String> insights) {
        this.insights = insights;
    }

    public List<String> getInsights() {
        return insights;
    }

    public void setInsights(List<String> insights) {
        this.insights = insights;
    }
}
