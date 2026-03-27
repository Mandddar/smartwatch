package com.smartwatch.repository;

import com.smartwatch.model.Alert;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface AlertRepository extends JpaRepository<Alert, Long> {

    List<Alert> findByUserIdOrderByTimestampDesc(Long userId);

    /** Alert count per day for the given user since a date */
    @Query(value = """
            SELECT CAST(a.timestamp AS DATE) AS alert_date,
                   COUNT(*)                  AS alert_count
            FROM alerts a
            WHERE a.user_id = :userId
              AND a.timestamp >= :since
            GROUP BY alert_date
            ORDER BY alert_date
            """, nativeQuery = true)
    List<Object[]> countByDay(@Param("userId") Long userId,
                              @Param("since") LocalDateTime since);
}
