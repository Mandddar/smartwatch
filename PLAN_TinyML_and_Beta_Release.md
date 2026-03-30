# VitalWatch: TinyML Integration + Beta Release on AWS

## Context

VitalWatch is a full-stack smartwatch health monitoring app (Spring Boot + React Native Expo + PostgreSQL) that currently runs all health algorithms server-side using simple rule-based logic. The goal is to:
1. **Add on-device TinyML models** that analyze health data locally on the phone for smarter, personalized insights
2. **Deploy to AWS and publish a beta app** for testers

This transforms the app from a basic threshold-alert system into an AI-powered health companion — a major differentiator for the project.

3. **Batch data sync** — vitals are stored locally and synced to the server every few hours (not real-time)
4. **Physician dashboard** (built by teammates) — deep analysis + raw logs for doctors to review
5. **In-app periodic reports** — health report cards (last 12h / last 24h) visible to the user

---

## Part 0: Data Flow Redesign (Batch Sync + Local-First)

### Current vs. New Data Flow

**Current (will change):**
```
Backend generates vitals every 5s -> stored in PostgreSQL -> app polls API every 5s
```

**New (local-first):**
```
Smartwatch -> Phone (local SQLite/AsyncStorage) -> TinyML runs locally -> batch sync every few hours -> Backend PostgreSQL -> Physician Dashboard + Deep Analysis
```

### Why This Matters
- The phone becomes the **primary data store** between syncs
- TinyML models run on locally-stored data (no server dependency for real-time insights)
- Backend receives bulk uploads and runs **deep analysis** that the physician dashboard consumes
- The app shows **periodic reports** (12h/24h summaries) generated from the batch-synced data on the server

### Local Storage Upgrade: AsyncStorage -> SQLite

The original plan used a 360-reading in-memory ring buffer. With batch sync, we need **much more storage** — potentially 12-24 hours of data (8,640-17,280 readings at 5s intervals) that persists reliably until synced.

**Upgrade to `expo-sqlite`** (Expo-managed compatible):
- Store ALL vitals locally in a SQLite table until synced
- Mark rows as `synced: boolean` — delete after confirmed upload
- TinyML models query the local DB for their input windows
- Reports screen queries local data for offline-capable summaries

### New Dependencies (additional)
```
expo-sqlite                ~14.0.0    (local vitals storage)
expo-background-fetch      ~12.0.0    (periodic background sync)
expo-task-manager          ~11.8.0    (background task registration)
```

### Batch Sync Design

**Sync Service** (`lib/sync/syncService.ts`):
- Collects all un-synced vitals from local SQLite
- Uploads in batches of 500 readings via `POST /api/vitals/batch`
- Marks rows as synced on success
- Retries on failure (exponential backoff)
- Runs via `expo-background-fetch` every 2-4 hours (configurable)
- Also triggers on-demand when user opens the Reports tab

**New Backend Endpoint:**
```
POST /api/vitals/batch
Body: { readings: [{ heartRate, spo2, steps, timestamp }, ...] }
Response: { received: 500, syncId: "uuid" }
```

This is the ONE new backend endpoint needed — receives bulk vitals from the app.

### File Structure Addition
```
smartwatch-mobile/
  lib/
    sync/
      syncService.ts              -- Batch upload logic + background scheduling
      localDb.ts                  -- SQLite schema, CRUD for vitals
      types.ts                    -- SyncStatus, LocalVital interfaces
```

---

## Part 0.5: In-App Periodic Reports

### What the User Sees

A new **Reports** tab or section (inside Analytics) showing:

1. **Daily Health Report** (generated every 24h or on-demand)
   - Heart rate: min, max, avg, resting HR, time in zones
   - SpO2: avg, any dips below 95%
   - Steps: total, hourly breakdown, active minutes
   - Sleep: duration, quality score (ML-predicted), estimated stages
   - Stress: avg level, peak periods
   - Anomalies: any flagged by the ML models
   - Activity breakdown: % sedentary / walking / running / sleeping

2. **12-Hour Summary** (quick glance card)
   - Key metrics at a glance with trend arrows vs. previous 12h

3. **Physician-Ready Export**
   - "Share with Doctor" button — generates a PDF or shareable link
   - Contains raw data + ML insights + charts
   - Links to the physician dashboard where the doctor can see full logs

### Data Source for Reports
- **Local reports** (available offline): Generated from local SQLite data + ML model outputs
- **Server reports** (richer, after sync): Backend runs deeper analysis (aggregations, long-term trends, cross-metric correlations) and returns structured report data
- App shows local report immediately, then enriches with server data after next sync

### Backend Report Endpoint
```
GET /api/reports/daily?date=2026-03-30
GET /api/reports/summary?range=12h
```

Returns structured report JSON that the app renders into cards/charts.

### Where the Physician Dashboard Fits
- Teammates build a **web dashboard** (separate frontend, same backend)
- Consumes the same PostgreSQL data that batch sync populates
- Shows raw vitals logs, detailed charts, anomaly flags, patient history
- Doctor can view any patient's data after the patient grants access
- Your app's "Share with Doctor" feature links the user to the dashboard or generates an access token

---

## Part 1: TinyML On-Device ML Integration

### Framework Choice: TensorFlow.js

**Why TF.js over TFLite/ONNX:**
- Works with Expo 51 managed workflow (no native module headaches)
- Uses `expo-gl` for WebGL acceleration (Expo-managed compatible)
- Models are tiny (<20KB each) — inference takes 5-15ms, imperceptible to users
- No workflow migration needed; keeps the fast EAS build pipeline intact

### New Dependencies
```
@tensorflow/tfjs           ~4.20.0
@tensorflow/tfjs-react-native ~1.0.0
expo-gl                    ~14.0.2
expo-sqlite                ~14.0.0     (local vitals DB + sync staging)
expo-background-fetch      ~12.0.0     (periodic background sync)
expo-task-manager          ~11.8.0     (background task registration)
@react-native-async-storage/async-storage ~1.23.1  (ML model cache, settings)
```

### Models to Implement (Priority Order)

| # | Model | Input | Output | Size | Use Case |
|---|-------|-------|--------|------|----------|
| 1 | **HR Anomaly Detection** (Autoencoder) | 60 HR readings (5 min window) | anomaly score 0-1 | ~15KB | Catches unusual HR patterns beyond simple thresholds |
| 2 | **Activity Classification** (Dense Classifier) | 12 readings x (HR + step-delta) | sedentary/walking/running/sleeping | ~8KB | Shows detected activity on dashboard |
| 3 | **Stress Estimation** (Regression) | 12 statistical features from 60-reading window | stress score 0-100 | ~5KB | Stress level gauge on home screen |
| 4 | **Sleep Quality Prediction** (Regression) | Session features (duration, avg HR, variance, SpO2) | quality score 0-100 | ~4KB | Enhances existing rule-based sleep score |

### Local Data Strategy: SQLite + In-Memory Window

- **SQLite** (`expo-sqlite`) stores ALL vitals locally until batch-synced to server
- **In-memory window** of last 360 readings kept for fast ML inference (populated from SQLite on app launch)
- ML models query the in-memory window; sync service reads from SQLite
- This serves dual purpose: ML input buffer + batch sync staging area

### File Structure
```
smartwatch-mobile/
  lib/
    api.ts                          (existing)
    auth.tsx                        (existing)
    ml/
      index.ts                      -- Public API: initML(), runInference(), addReading()
      tfSetup.ts                    -- TF.js initialization
      vitalsBuffer.ts               -- Ring buffer + AsyncStorage persistence
      preprocessing.ts              -- Normalization, feature extraction
      types.ts                      -- MLInsights, VitalReading interfaces
      models/
        heartRateAnomaly.ts         -- Autoencoder: load, preprocess, infer
        activityClassifier.ts       -- Activity classification
        stressEstimator.ts          -- Stress level estimation
        sleepQualityPredictor.ts    -- Sleep quality prediction
  assets/
    models/                         -- Bundled TF.js model JSON + weight binaries
```

### Training Pipeline
```
ml-training/                        (new dir at project root, NOT deployed)
  train_hr_anomaly.py               -- Synthetic data generation + autoencoder training
  train_activity.py                 -- Activity classifier training
  train_stress.py                   -- Stress estimator training
  train_sleep_quality.py            -- Sleep quality training
  export_models.sh                  -- tensorflowjs_converter to TF.js format
  requirements.txt                  -- Python deps (tensorflow, numpy)
```

Training uses synthetic data matching the backend's VitalScheduler distributions (HR 65-120, SpO2 95-99, steps cumulative). Models are pre-trained and bundled — no on-device training for v1.

### UI Integration Points

**Home Screen** (app/(tabs)/index.tsx):
- Replace rule-based `calcHealthScore()` with ML-enhanced scoring (keep rule-based as fallback when buffer < 60 readings)
- Add **ML Insights Card** below existing AI Insights: anomaly status, activity label, stress gauge
- Push each polled vital into `VitalsBuffer` + trigger inference

**Analytics Screen** (app/(tabs)/analytics.tsx):
- Add stress level trend chart
- Add activity distribution breakdown

**Alerts Screen** (app/(tabs)/alerts.tsx):
- Generate local alerts when `anomalyScore > 0.8` with "On-device AI" badge

**Profile Screen** (app/(tabs)/profile.tsx):
- Add ML model status info row
- Add "On-device AI analysis" toggle

### Key Design Decisions
- **ML is supplementary, not replacing** — backend InsightsService and RuleEngine remain untouched
- **No new backend endpoints** — ML runs entirely on-device using existing data
- **Graceful degradation** — if TF.js fails to init, all ML UI is hidden, app works identically to current state
- **Inference every 5 seconds** (on each poll) — models are small enough that this is fine

---

## Part 2: AWS Deployment + Beta Release

### AWS Architecture (Cost-Optimized for Beta)

```
  Beta Testers (Android APK)
        |
        | HTTPS
        v
  +-------------------+     +--------------------+
  |  AWS App Runner    |---->|  RDS PostgreSQL    |
  |  (0.25 vCPU)      |     |  (db.t4g.micro)    |
  |  Port 8080         |     |  Free tier          |
  |  Auto-HTTPS        |     +--------------------+
  +-------------------+
        |                    +--------------------+
        +------------------->|  Secrets Manager   |
        |                    |  JWT + DB creds    |
  +-----+-------------+     +--------------------+
  |  ECR Repository    |
  |  Docker images     |     +--------------------+
  +-------------------+     |  CloudWatch        |
                             |  Logs + Alarms     |
                             +--------------------+
```

**Estimated cost: $6-17/month** (possibly $0 RDS if within free tier)

**Why App Runner:** Zero ops, built-in HTTPS, auto-scales, deploys from ECR in one command. No ALB, no ECS task definitions, no EC2 patching.

### Backend Changes Required

| Change | File | What |
|--------|------|------|
| Add health endpoint | pom.xml | Add `spring-boot-starter-actuator` |
| Expose health check | application.properties | `management.endpoints.web.exposure.include=health` |
| Permit health check | SecurityConfig.java | Add `/actuator/health` to permitAll |
| Add Flyway migrations | pom.xml | Add `flyway-core` dependency |
| Baseline migration | NEW: `db/migration/V1__baseline.sql` | Current schema as SQL |
| Production profile | NEW: `application-prod.properties` | `ddl-auto=validate`, Flyway enabled |
| Remove H2 | pom.xml | Remove unused H2 dependency |

### Frontend Changes Required

| Change | File | What |
|--------|------|------|
| Beta build profile | eas.json | Add `beta` profile with App Runner URL |
| OTA updates | app.json | Add `runtimeVersion` + `updates` config |
| Version bump | app.json | `1.0.0-beta.1`, versionCode 2 |
| Install expo-updates | package.json | `npx expo install expo-updates` |

### Beta Distribution Strategy
1. **Immediate:** Direct APK via `eas build --profile beta` — share download link with testers
2. **Week 2:** Google Play Internal Testing (up to 100 testers, auto-updates, crash reports)
3. **Ongoing:** EAS Update for OTA JavaScript patches without rebuilding APKs

### Security Checklist
- [ ] Generate random 256-bit JWT secret -> AWS Secrets Manager
- [ ] Generate strong DB password -> AWS Secrets Manager
- [ ] HTTPS enforced (App Runner default)
- [ ] Switch to `ddl-auto=validate` + Flyway
- [ ] Add rate limiting on `/api/auth/login`

---

## Implementation Order

### Phase 1: Backend Prep (Days 1-2)
1. Add Actuator + health endpoint
2. Add Flyway + baseline migration, switch to `ddl-auto=validate`
3. Create `application-prod.properties`
4. Add `POST /api/vitals/batch` endpoint for bulk vital uploads
5. Add `GET /api/reports/daily` and `GET /api/reports/summary` endpoints
6. Add basic `@SpringBootTest`

### Phase 2: AWS Infrastructure (Days 2-3)
7. Create ECR repository
8. Create RDS PostgreSQL (db.t4g.micro, ap-south-1)
9. Store secrets in Secrets Manager
10. Build & push Docker image to ECR
11. Create App Runner service with VPC connector to RDS
12. Verify: `GET /actuator/health` returns UP

### Phase 3: Local Data Layer (Days 3-5)
13. Install expo-sqlite, expo-background-fetch, expo-task-manager
14. Create `lib/sync/localDb.ts` — SQLite schema for local vitals storage
15. Create `lib/sync/syncService.ts` — batch upload + background scheduling
16. Rewire Home screen: vitals from smartwatch -> SQLite -> display (instead of polling backend)
17. Test: vitals accumulate locally, batch sync uploads to cloud backend

### Phase 4: Frontend Beta Config (Days 5-6)
18. Add beta EAS profile pointing to App Runner URL
19. Configure EAS Update
20. Bump version to `1.0.0-beta.1`
21. Build beta APK, test end-to-end against cloud backend

### Phase 5: Beta Distribution (Days 6-7)
22. Share APK with 3-5 initial testers
23. Set up Google Play Internal Testing (parallel)
24. Configure EAS Update channel for OTA patches

### Phase 6: TinyML Foundation (Days 7-10)
25. Install TF.js + expo-gl + async-storage
26. Create `lib/ml/` structure: types, tfSetup, vitalsBuffer (reads from SQLite), preprocessing
27. Wire TF init into root `_layout.tsx`
28. Wire in-memory ML window populated from local SQLite

### Phase 7: ML Models (Days 10-16)
29. Train HR anomaly autoencoder (Python), export to TF.js, bundle in assets
30. Implement `heartRateAnomaly.ts`, integrate into Home screen
31. Train + implement activity classifier
32. Train + implement stress estimator
33. Train + implement sleep quality predictor

### Phase 8: ML UI + Reports Integration (Days 16-20)
34. Add ML Insights Card to Home screen
35. Add stress/activity charts to Analytics screen
36. Add local anomaly alerts to Alerts screen
37. Add ML status to Profile screen
38. Build **Reports screen** — daily health report + 12h summary cards
39. Add "Share with Doctor" export (PDF or shareable link)
40. Wire reports to local data (offline) + server reports (after sync)

### Phase 9: Polish + Ship (Days 20-23)
41. Test on multiple Android devices, memory profiling
42. Test batch sync reliability (airplane mode -> reconnect -> verify sync)
43. Set up CloudWatch alarms (5xx rate, latency)
44. Set up CI/CD (GitHub Actions for backend deploy + EAS build)
45. Push OTA update with ML + reports features to beta testers

---

## Verification Plan

1. **Backend health:** `curl https://<app-runner-url>/actuator/health` -> `{"status":"UP"}`
2. **Auth flow:** Register + login via the beta APK against cloud backend
3. **Local storage:** Connect device, verify vitals are stored in local SQLite (not just server)
4. **Batch sync:** Accumulate 30 min of data -> trigger sync -> verify data appears on server
5. **Offline resilience:** Put phone in airplane mode -> vitals still collected locally -> reconnect -> sync completes
6. **ML init:** Check console logs for "TF.js ready" on app launch
7. **ML inference:** After 5 min of data collection, ML Insights Card should show anomaly score, activity, and stress level
8. **Reports:** Open daily report -> verify it renders from local data (offline) and enriches after sync
9. **OTA update:** Push an EAS Update, verify beta testers receive it without reinstalling
10. **Graceful degradation:** Force TF.js init failure -> verify app works identically minus ML features

---

## Critical Files Reference

**Frontend (modify):**
- `app.json` — plugins, version, EAS Update
- `eas.json` — beta build profile
- `package.json` — new ML deps
- `app/_layout.tsx` — TF.js init
- `app/(tabs)/index.tsx` — ML integration, buffer wiring
- `app/(tabs)/analytics.tsx` — ML charts
- `app/(tabs)/alerts.tsx` — local ML alerts
- `app/(tabs)/profile.tsx` — ML status

**Frontend (create):**
- `lib/ml/` — entire ML layer (index, tfSetup, vitalsBuffer, preprocessing, types, 4 model files)
- `lib/sync/` — local SQLite DB + batch sync service + background task
- `assets/models/` — bundled model JSON + weights (8 files)
- Reports screen or section — daily report + 12h summary + share with doctor

**Backend (modify):**
- `pom.xml` — Actuator, Flyway, remove H2
- `application.properties` — Actuator + Flyway config
- `SecurityConfig.java` — permit health endpoint

**Backend (create):**
- `VitalController` — add `POST /api/vitals/batch` for bulk uploads
- `ReportsController` + `ReportsService` — daily/summary report generation
- `application-prod.properties` — production profile
- `db/migration/V1__baseline.sql` — Flyway baseline
- `.github/workflows/` — CI/CD pipelines

**Training (create):**
- `ml-training/` — Python training scripts + export pipeline
