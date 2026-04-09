# VitalWatch: Complete Project Summary for Dashboard Team

> **Purpose:** This document gives the dashboard developer everything they need to build the physician/clinical web dashboard that consumes VitalWatch backend data. It covers architecture, every API endpoint, database schema, data flow, ML models, and the sync pipeline.

---

## 1. Project Overview

**VitalWatch** is a smartwatch health monitoring platform:
- **Mobile App** (React Native Expo 51, TypeScript) — worn by patients, runs TinyML on-device
- **Backend API** (Spring Boot 3.2, Java 17) — REST API, PostgreSQL 15, JWT auth
- **Physician Dashboard** (YOUR part) — web frontend that shows deep analysis + raw logs for doctors

**Data flow:**
```
Smartwatch -> Phone App (stores locally in SQLite)
    -> TinyML runs on-device (anomaly, activity, stress, sleep)
    -> Batch sync every few hours -> Backend API -> PostgreSQL
    -> YOUR DASHBOARD reads from the same backend API / PostgreSQL
```

---

## 2. Backend API -- Complete Endpoint Reference

**Base URL:** `http://localhost:8085` (dev) or `https://<app-runner-url>` (prod)
**Auth:** JWT Bearer token in `Authorization` header for all `/api/**` except auth endpoints

### Authentication
| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/auth/register` | `{name, email, password, dateOfBirth, gender}` | `{token, email, userId}` |
| POST | `/api/auth/login` | `{email, password}` | `{token, email, userId}` |

**JWT:** HS256, expires in 24h. Payload: `{sub: userId, email, iat, exp}`

### Vitals (Core Health Data)
| Method | Endpoint | Params | Response |
|--------|----------|--------|----------|
| GET | `/api/vitals/latest` | -- | `{heartRate, spo2, steps, timestamp}` |
| GET | `/api/vitals/history?limit=20` | `limit` (max 100) | `[{heartRate, spo2, steps, timestamp}, ...]` |
| GET | `/api/vitals?from=ISO&to=ISO` | `from`, `to` (ISO-8601) | `[{heartRate, spo2, steps, timestamp}, ...]` sorted asc |
| GET | `/api/vitals/aggregate?type=hourly` | `type`: hourly/daily | `[{bucket, avgHeartRate, avgSpO2, totalSteps}, ...]` |
| GET | `/api/vitals/trends?range=weekly` | `range` | `{avgHeartRate, minHeartRate, maxHeartRate, trendDirection, dailyData[]}` |
| POST | `/api/vitals/batch` | `{readings: [{heartRate, spo2, steps, timestamp}, ...]}` | `{received, syncId}` |
| GET | `/api/vitals/sleep/latest` | -- | `{id, startTime, endTime, qualityScore}` or 204 |

### Reports (Daily/Summary)
| Method | Endpoint | Params | Response |
|--------|----------|--------|----------|
| GET | `/api/reports/daily?date=2026-03-30` | `date` (optional, defaults to today) | See below |
| GET | `/api/reports/summary?range=12h` | `range`: 12h/24h/48h | See below |

**Daily Report Response:**
```json
{
  "date": "2026-03-30",
  "heartRate": { "avg": 75.0, "min": 62, "max": 98, "elevatedReadings": 3 },
  "spo2": { "avg": 97.5, "min": 95, "lowReadings": 0 },
  "steps": { "total": 8432, "activeMinutes": 47 },
  "sleep": { "totalMinutes": 420, "qualityScore": 78.5 },
  "alertCount": 2
}
```

**Summary Report Response:**
```json
{
  "range": "12h",
  "avgHeartRate": 74.2,
  "avgSpo2": 97.8,
  "totalSteps": 4200,
  "alertCount": 1,
  "trendDirection": "stable"
}
```

### Alerts
| Method | Endpoint | Params | Response |
|--------|----------|--------|----------|
| GET | `/api/alerts` | -- | `[{id, message, timestamp, read, severity}, ...]` newest first |
| GET | `/api/alerts/stats?range=7d` | `range`: "Xd" (1-90) | `[{date, alertCount}, ...]` |

**Severity values:** `LOW`, `MEDIUM`, `CRITICAL`
**Alert trigger:** HR > 85% of (220 - age) sustained for 3+ consecutive readings. Or personal baseline + 2*std when personalized.

### Insights
| Method | Endpoint | Response |
|--------|----------|----------|
| GET | `/api/insights/summary` | `{insights: ["Your HR increased 8% vs yesterday", ...]}` |

### Baselines (Adaptive Personal Thresholds)
| Method | Endpoint | Response |
|--------|----------|----------|
| GET | `/api/baselines` | `[{metric, mean, std, min, max, lowerBound, upperBound, sampleCount, personalized, lastUpdated}, ...]` |
| GET | `/api/baselines/{metric}` | Single baseline for `hr_resting`, `hr_active`, `spo2`, `steps_daily` |
| GET | `/api/baselines/status` | `{personalized: bool, hrThreshold: int or "using age-based default"}` |

**Personalized = true** when `sampleCount >= 1008` (~7 days of data). Before that, the system uses the standard 220-age formula.

### Device
| Method | Endpoint | Response |
|--------|----------|----------|
| POST | `/api/device/connect` | `{status: "CONNECTED"}` |
| POST | `/api/device/disconnect` | `{status: "DISCONNECTED"}` |
| GET | `/api/device/status` | `{status: "CONNECTED" or "DISCONNECTED"}` |

### Preferences
| Method | Endpoint | Body/Response |
|--------|----------|---------------|
| GET | `/api/preferences` | `{enableHeartRateAlerts, enableGeneralAlerts}` |
| PUT | `/api/preferences` | Body: `{enableHeartRateAlerts?, enableGeneralAlerts?}` |

---

## 3. Database Schema (PostgreSQL 15)

```sql
-- Users
users (
    id BIGSERIAL PK,
    name VARCHAR NOT NULL,
    email VARCHAR NOT NULL UNIQUE,
    password VARCHAR NOT NULL,        -- BCrypt hashed
    date_of_birth DATE NOT NULL,      -- Used for age-based HR threshold (220-age)
    gender VARCHAR,
    created_at TIMESTAMP
)

-- Vitals (core health data -- 1 row per 5-second reading)
vitals (
    id BIGSERIAL PK,
    heart_rate INTEGER,               -- BPM (65-120 typical)
    spo2 INTEGER,                     -- Blood oxygen % (95-99 typical)
    steps INTEGER,                    -- Cumulative step count
    timestamp TIMESTAMP NOT NULL,
    user_id BIGINT FK -> users(id)
    -- INDEXES: (timestamp), (user_id, timestamp)
)
-- NOTE: ~17,280 rows/user/day at 5-second intervals

-- Alerts
alerts (
    id BIGSERIAL PK,
    message VARCHAR NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    severity VARCHAR NOT NULL,        -- 'LOW', 'MEDIUM', 'CRITICAL'
    user_id BIGINT FK -> users(id)
    -- INDEXES: (timestamp), (user_id, timestamp)
)

-- Sleep Sessions
sleep_sessions (
    id BIGSERIAL PK,
    user_id BIGINT FK -> users(id),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,               -- NULL if ongoing
    quality_score DOUBLE NOT NULL      -- 0-100
    -- INDEX: (user_id, start_time)
)

-- Devices
devices (
    id BIGSERIAL PK,
    status VARCHAR NOT NULL,          -- 'CONNECTED' or 'DISCONNECTED'
    user_id BIGINT UNIQUE FK -> users(id),
    last_connected_at TIMESTAMP
)

-- Notification Preferences
notification_preferences (
    id BIGSERIAL PK,
    enable_heart_rate_alerts BOOLEAN DEFAULT TRUE,
    enable_general_alerts BOOLEAN DEFAULT TRUE,
    user_id BIGINT UNIQUE FK -> users(id)
)

-- Personal Baselines (adaptive thresholds)
user_baselines (
    id BIGSERIAL PK,
    user_id BIGINT FK -> users(id),
    metric VARCHAR(50) NOT NULL,      -- 'hr_resting', 'hr_active', 'spo2', 'steps_daily'
    baseline_mean DOUBLE NOT NULL,
    baseline_std DOUBLE NOT NULL,
    baseline_min DOUBLE NOT NULL,
    baseline_max DOUBLE NOT NULL,
    sample_count INTEGER NOT NULL,     -- personalized when >= 1008
    last_updated TIMESTAMP NOT NULL,
    UNIQUE(user_id, metric)
)
```

**Connection:** `jdbc:postgresql://localhost:5433/smartwatch` (user: `smartwatch`, pass: `smartwatch_secret`)
**Docker:** `docker compose up -d db` from `smartwatch/database/`

---

## 4. Data Generation & Sync Pipeline

### How Data Gets Created (Currently Simulated)
1. User clicks "Connect Device" -> `POST /api/device/connect`
2. Backend `VitalScheduler` runs every 5 seconds:
   - Generates: HR 65-120 (50-60 during sleep), SpO2 95-99, Steps cumulative +0/+1
   - Saves to `vitals` table
   - `RuleEngine` checks thresholds -> creates `Alert` if sustained violation
   - `SleepSession` auto-detected from low movement + stable low HR

### How Mobile App Syncs (Batch)
1. App polls `GET /api/vitals/latest` every 5 seconds for display
2. Each reading is also stored in local SQLite (`synced=0`)
3. User triggers `POST /api/vitals/batch` with up to 500 readings
4. Backend stores them, marks as synced on app side
5. **vitals table has data from both the simulator AND batch uploads**

### For Your Dashboard
- **Read directly from PostgreSQL** (or via the REST API)
- The `vitals` table is your primary data source
- Use `user_id + timestamp` range queries for patient data
- `alerts` table has all triggered health alerts with severity
- `sleep_sessions` has detected sleep periods
- `user_baselines` has the patient's learned personal ranges
- `/api/reports/daily` and `/api/reports/summary` give pre-computed summaries

---

## 5. On-Device ML Models (What the App Does Locally)

The mobile app runs 4 TinyML models on-device. Your dashboard should be aware of what these do since patients will reference them:

| Model | What it detects | Output |
|-------|----------------|--------|
| **HR Anomaly Detection** | Unusual HR patterns (spikes, sustained elevation, bradycardia, rapid changes) | anomalyScore 0-1, anomalyDetected boolean, message |
| **Activity Classification** | Current activity state | `sedentary` / `walking` / `running` / `sleeping` + confidence 0-1 |
| **Stress Estimation** | Stress level from HR variability (RMSSD proxy) | stressLevel 0-100, label: `low`/`moderate`/`high` |
| **Sleep Quality Prediction** | Predicted sleep quality from session features | qualityScore 0-100 |

**These run on the PHONE, not the backend.** The dashboard doesn't need to replicate them -- but you could implement similar server-side analysis using the raw vitals data in PostgreSQL for deeper/historical analysis.

### Useful SQL Queries for Dashboard Analytics

```sql
-- Hourly HR averages for a patient (last 24h)
SELECT DATE_TRUNC('hour', timestamp) AS bucket,
       AVG(heart_rate) AS avg_hr, AVG(spo2) AS avg_spo2, MAX(steps) AS total_steps
FROM vitals WHERE user_id = ? AND timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY bucket ORDER BY bucket;

-- Daily averages (last 30 days)
SELECT DATE_TRUNC('day', timestamp) AS bucket,
       AVG(heart_rate), AVG(spo2), MAX(steps) - MIN(steps) AS daily_steps
FROM vitals WHERE user_id = ? AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY bucket ORDER BY bucket;

-- Alert frequency by severity
SELECT severity, COUNT(*) FROM alerts
WHERE user_id = ? AND timestamp >= NOW() - INTERVAL '7 days'
GROUP BY severity;

-- Patient's personal baselines
SELECT metric, baseline_mean, baseline_std, baseline_min, baseline_max, sample_count
FROM user_baselines WHERE user_id = ?;

-- Sleep sessions for last 14 days
SELECT start_time, end_time, quality_score,
       EXTRACT(EPOCH FROM (end_time - start_time))/3600 AS duration_hours
FROM sleep_sessions WHERE user_id = ? AND start_time >= NOW() - INTERVAL '14 days'
ORDER BY start_time DESC;

-- Anomalous readings (HR outside personal baseline +/- 2*std)
SELECT v.* FROM vitals v
JOIN user_baselines b ON b.user_id = v.user_id AND b.metric = 'hr_resting'
WHERE v.user_id = ? AND v.heart_rate > (b.baseline_mean + 2 * b.baseline_std)
ORDER BY v.timestamp DESC LIMIT 50;
```

---

## 6. What the Dashboard Should Show

### Patient Overview
- Patient name, age (from DOB), gender
- Device connection status
- Baseline personalization status (learning vs personalized)
- Last sync time

### Vital Signs Dashboard
- Real-time (or near-real-time) HR, SpO2, Steps from latest vitals
- 24h / 7d / 30d trend charts (HR, SpO2, Steps)
- Personal baseline ranges overlaid on charts ("patient's normal range")
- Anomalous readings highlighted (outside baseline +/- 2*std)

### Alerts & Anomalies
- Full alert history with severity badges
- Timeline view of when alerts fired
- Filter by severity, date range

### Sleep Analysis
- Sleep session history (start/end, duration, quality score)
- Sleep quality trend over time

### Health Reports
- Daily health summary (use `/api/reports/daily`)
- Exportable reports for medical records

### Raw Data Access
- Ability to query raw vitals by time range
- CSV/JSON export for physician's own analysis

---

## 7. How to Run the Backend Locally

```bash
# 1. Start PostgreSQL (requires Docker Desktop)
cd smartwatch/database
docker compose up -d db

# 2. Wait for healthy, then start backend
cd ../backend
mvn spring-boot:run
# Runs on http://localhost:8085

# 3. Test it
curl http://localhost:8085/actuator/health
# -> {"status":"UP"}

# Register a test user
curl -X POST http://localhost:8085/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","password":"pass1234","dateOfBirth":"1998-05-15","gender":"male"}'

# Connect device (starts generating data)
TOKEN="<token from register response>"
curl -X POST http://localhost:8085/api/device/connect \
  -H "Authorization: Bearer $TOKEN"

# After 30 seconds, check vitals
curl http://localhost:8085/api/vitals/history?limit=5 \
  -H "Authorization: Bearer $TOKEN"
```

---

## 8. Tech Stack Summary

| Component | Technology | Port |
|-----------|-----------|------|
| Backend API | Spring Boot 3.2, Java 17 | 8085 (local), 8080 (Docker) |
| Database | PostgreSQL 15 | 5433 |
| Mobile App | React Native Expo 51, TypeScript | 8081 (dev) |
| ML Models | TensorFlow.js (on-device) | -- |
| Local Storage | SQLite (expo-sqlite) | -- |
| Auth | JWT (HS256, 24h expiry) | -- |
| Build | Maven (backend), EAS Build (frontend) | -- |

---

## 9. File Structure (Key Backend Files)

```
smartwatch/backend/src/main/java/com/smartwatch/
|-- controller/
|   |-- AuthController.java          -- /api/auth/*
|   |-- VitalController.java         -- /api/vitals/* (including batch)
|   |-- AlertController.java         -- /api/alerts/*
|   |-- ReportsController.java       -- /api/reports/*
|   |-- InsightsController.java      -- /api/insights/*
|   |-- BaselineController.java      -- /api/baselines/*
|   |-- DeviceController.java        -- /api/device/*
|   |-- PreferencesController.java   -- /api/preferences/*
|-- service/
|   |-- VitalService.java            -- aggregation, trends, batch save
|   |-- BaselineService.java         -- EWMA baseline computation
|   |-- RuleEngine.java              -- HR threshold alerts (personal or age-based)
|   |-- ReportsService.java          -- daily/summary report generation
|   |-- InsightsService.java         -- text insight generation
|   |-- AlertService.java
|-- model/
|   |-- User.java, Vital.java, Alert.java, SleepSession.java
|   |-- Device.java, NotificationPreference.java, UserBaseline.java
|-- repository/                      -- JPA repositories for each entity
|-- dto/                             -- Request/Response records
|-- config/
|   |-- SecurityConfig.java          -- JWT filter, CORS, endpoint permissions
|   |-- JwtUtil.java                 -- Token generation/validation
|   |-- JwtAuthFilter.java
|-- scheduler/
    |-- VitalScheduler.java          -- Generates simulated vitals every 5s
```
