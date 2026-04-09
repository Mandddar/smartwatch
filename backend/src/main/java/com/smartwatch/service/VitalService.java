package com.smartwatch.service;

import com.smartwatch.dto.VitalAggregateResponse;
import com.smartwatch.dto.VitalResponse;
import com.smartwatch.model.User;
import com.smartwatch.model.Vital;
import com.smartwatch.repository.UserRepository;
import com.smartwatch.repository.VitalRepository;
import com.smartwatch.exception.NotFoundException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import com.smartwatch.dto.VitalBatchRequest;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class VitalService {

    private final VitalRepository vitalRepository;
    private final UserRepository userRepository;

    public VitalService(VitalRepository vitalRepository, UserRepository userRepository) {
        this.vitalRepository = vitalRepository;
        this.userRepository = userRepository;
    }

    public Optional<VitalResponse> getLatest(Long userId) {
        return vitalRepository.findFirstByUserIdOrderByTimestampDesc(userId)
                .map(this::toResponse);
    }

    public List<VitalResponse> getHistory(Long userId, int limit) {
        return vitalRepository.findByUserIdOrderByTimestampDesc(userId, PageRequest.of(0, limit))
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    /** Raw vitals between two timestamps, sorted ascending */
    public List<VitalResponse> getRange(Long userId, LocalDateTime from, LocalDateTime to) {
        return vitalRepository.findByUserIdAndTimestampBetweenOrderByTimestampAsc(userId, from, to)
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    /** Hourly-bucketed aggregation for the last 24 hours */
    public List<VitalAggregateResponse> getHourlyAggregate(Long userId) {
        LocalDateTime since = LocalDateTime.now().minusHours(24);
        return vitalRepository.aggregateHourly(userId, since)
                .stream()
                .map(this::toAggregateResponse)
                .collect(Collectors.toList());
    }

    /** Daily-bucketed aggregation for the last 7 days */
    public List<VitalAggregateResponse> getDailyAggregate(Long userId) {
        LocalDateTime since = LocalDateTime.now().minusDays(7);
        return vitalRepository.aggregateDaily(userId, since)
                .stream()
                .map(this::toAggregateResponse)
                .collect(Collectors.toList());
    }

    public com.smartwatch.dto.VitalsTrendResponse getVitalsTrends(Long userId, String range) {
        if (!userRepository.existsById(userId)) throw new NotFoundException("User not found");

        LocalDateTime since = LocalDateTime.now().minusDays(7);
        List<VitalAggregateResponse> dailyData = vitalRepository.aggregateDaily(userId, since)
                .stream()
                .map(this::toAggregateResponse)
                .collect(Collectors.toList());

        com.smartwatch.dto.VitalsTrendResponse response = new com.smartwatch.dto.VitalsTrendResponse();
        response.setDailyData(dailyData);

        if (dailyData.isEmpty()) {
            response.setTrendDirection("stable");
            return response;
        }

        double totalHr = 0;
        int count = 0;
        List<Vital> raws = vitalRepository.findByUserIdAndTimestampBetweenOrderByTimestampAsc(userId, since, LocalDateTime.now());
        
        int minHr = Integer.MAX_VALUE;
        int maxHr = Integer.MIN_VALUE;
        for (Vital v : raws) {
            if (v.getHeartRate() != null) {
                totalHr += v.getHeartRate();
                count++;
                if (v.getHeartRate() < minHr) minHr = v.getHeartRate();
                if (v.getHeartRate() > maxHr) maxHr = v.getHeartRate();
            }
        }
        
        if (count > 0) {
            response.setAvgHeartRate(Math.round((totalHr / count) * 10.0) / 10.0);
            response.setMinHeartRate(minHr);
            response.setMaxHeartRate(maxHr);
        } else {
            response.setAvgHeartRate(0);
            response.setMinHeartRate(0);
            response.setMaxHeartRate(0);
        }

        if (dailyData.size() >= 2) {
            Double first = dailyData.get(0).avgHeartRate();
            Double last = dailyData.get(dailyData.size() - 1).avgHeartRate();
            if (first != null && last != null) {
                if (last > first * 1.05) response.setTrendDirection("increasing");
                else if (last < first * 0.95) response.setTrendDirection("decreasing");
                else response.setTrendDirection("stable");
            } else {
                response.setTrendDirection("stable");
            }
        } else {
            response.setTrendDirection("stable");
        }

        return response;
    }

    public Vital saveVital(User user, int heartRate, int spo2, int steps, LocalDateTime timestamp) {
        Vital v = new Vital();
        v.setUser(user);
        v.setHeartRate(heartRate);
        v.setSpo2(spo2);
        v.setSteps(steps);
        v.setTimestamp(timestamp);
        return vitalRepository.save(v);
    }

    @Transactional
    public int saveBatch(User user, List<VitalBatchRequest.Reading> readings) {
        List<Vital> vitals = new ArrayList<>(readings.size());
        for (VitalBatchRequest.Reading r : readings) {
            // Validate vital ranges — skip invalid readings
            if (r.heartRate() < 20 || r.heartRate() > 250) continue;
            if (r.spo2() < 50 || r.spo2() > 100) continue;
            if (r.steps() < 0) continue;
            if (r.timestamp() == null) continue;

            Vital v = new Vital();
            v.setUser(user);
            v.setHeartRate(r.heartRate());
            v.setSpo2(r.spo2());
            v.setSteps(r.steps());
            v.setTimestamp(r.timestamp());
            vitals.add(v);
        }
        if (!vitals.isEmpty()) {
            vitalRepository.saveAll(vitals);
        }
        return vitals.size();
    }

    public Integer getLastSteps(Long userId) {
        return vitalRepository.findFirstByUserIdOrderByTimestampDesc(userId)
                .map(Vital::getSteps)
                .orElse(0);
    }

    private VitalResponse toResponse(Vital v) {
        return new VitalResponse(v.getHeartRate(), v.getSpo2(), v.getSteps(), v.getTimestamp());
    }

    private VitalAggregateResponse toAggregateResponse(Object[] row) {
        Timestamp ts = (Timestamp) row[0];
        LocalDateTime bucket = ts.toLocalDateTime();
        Double avgHr = row[1] != null ? ((Number) row[1]).doubleValue() : null;
        Double avgSpO2 = row[2] != null ? ((Number) row[2]).doubleValue() : null;
        Long totalSteps = row[3] != null ? ((Number) row[3]).longValue() : null;
        return new VitalAggregateResponse(bucket,
                avgHr != null ? Math.round(avgHr * 10.0) / 10.0 : null,
                avgSpO2 != null ? Math.round(avgSpO2 * 10.0) / 10.0 : null,
                totalSteps);
    }
}
