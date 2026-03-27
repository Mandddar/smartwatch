package com.smartwatch.repository;

import com.smartwatch.model.Vital;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface VitalRepository extends JpaRepository<Vital, Long> {

    Optional<Vital> findFirstByUserIdOrderByTimestampDesc(Long userId);

    List<Vital> findByUserIdOrderByTimestampDesc(Long userId, org.springframework.data.domain.Pageable pageable);

    /** Raw range query — sorted ascending for chart rendering */
    List<Vital> findByUserIdAndTimestampBetweenOrderByTimestampAsc(
            Long userId, LocalDateTime from, LocalDateTime to);

    /** Hourly aggregation — avg heart rate, avg spo2, max steps per hour bucket */
    @Query(value = """
            SELECT DATE_TRUNC('hour', v.timestamp) AS bucket,
                   AVG(v.heart_rate)                AS avg_hr,
                   AVG(v.spo2)                      AS avg_spo2,
                   MAX(v.steps)                     AS total_steps
            FROM vitals v
            WHERE v.user_id = :userId
              AND v.timestamp >= :since
            GROUP BY bucket
            ORDER BY bucket
            """, nativeQuery = true)
    List<Object[]> aggregateHourly(@Param("userId") Long userId,
                                   @Param("since") LocalDateTime since);

    /** Daily aggregation — avg heart rate, avg spo2, max steps per day bucket */
    @Query(value = """
            SELECT DATE_TRUNC('day', v.timestamp) AS bucket,
                   AVG(v.heart_rate)               AS avg_hr,
                   AVG(v.spo2)                     AS avg_spo2,
                   MAX(v.steps)                    AS total_steps
            FROM vitals v
            WHERE v.user_id = :userId
              AND v.timestamp >= :since
            GROUP BY bucket
            ORDER BY bucket
            """, nativeQuery = true)
    List<Object[]> aggregateDaily(@Param("userId") Long userId,
                                  @Param("since") LocalDateTime since);
}
