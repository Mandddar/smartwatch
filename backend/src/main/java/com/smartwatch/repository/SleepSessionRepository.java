package com.smartwatch.repository;

import com.smartwatch.model.SleepSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface SleepSessionRepository extends JpaRepository<SleepSession, Long> {
    List<SleepSession> findByUserIdOrderByStartTimeDesc(Long userId);
    Optional<SleepSession> findFirstByUserIdOrderByStartTimeDesc(Long userId);
    Optional<SleepSession> findFirstByUserIdAndEndTimeIsNullOrderByStartTimeDesc(Long userId);
}
