package com.smartwatch.repository;

import com.smartwatch.model.UserBaseline;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserBaselineRepository extends JpaRepository<UserBaseline, Long> {
    List<UserBaseline> findByUserId(Long userId);
    Optional<UserBaseline> findByUserIdAndMetric(Long userId, String metric);
}
