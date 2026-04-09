# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

VitalWatch — a full-stack smartwatch health monitoring platform with on-device TinyML inference. Three main components: Spring Boot backend, React Native Expo frontend, and Python ML training pipeline.

## Commands

### Database (PostgreSQL via Docker)
```bash
cd database && docker compose up -d db     # Start PostgreSQL on port 5433
docker ps --filter "name=smartwatch-db"     # Check health
```

### Backend (Spring Boot 3.2, Java 17)
```bash
cd backend && mvn spring-boot:run           # Starts on port 8085
curl http://localhost:8085/actuator/health   # Verify running
```

### Frontend (React Native Expo 51)
```bash
cd frontend/smartwatch-mobile
npx expo start --web                        # Web dev on port 8081
npx expo start --android                    # Android dev
eas build --profile preview --platform android  # Build APK
```

### ML Model Training (Python, TensorFlow)
```bash
cd ml-training
python train_all_models.py                  # Train all 4 models, outputs to frontend/smartwatch-mobile/assets/models/
python evaluate_models.py                   # Run accuracy evaluation
python convert_to_tfjs.py                   # Convert SavedModel to TF.js format
```
Note: Use Python 3.10 (`C:\Users\MANDAR\AppData\Local\Programs\Python\Python310\python.exe`) — TensorFlow is installed there, not on Python 3.14.

### Full Stack (Docker Compose)
```bash
cd database && docker-compose up --build    # Starts PostgreSQL (5433) + Backend (8080) + Frontend (8081)
```

## Architecture

```
smartwatch/
├── backend/           Spring Boot REST API (Java 17, Maven)
├── frontend/          React Native Expo 51 (TypeScript)
│   └── smartwatch-mobile/
│       ├── app/(tabs)/     Expo Router screens (Home, Analytics, Reports, Alerts, Profile)
│       ├── lib/ml/         TinyML inference layer (4 models + baselines)
│       ├── lib/sync/       SQLite local storage + batch sync + background sync
│       ├── lib/health/     Google Health Connect integration (stub for now)
│       └── assets/models/  Trained TF.js model weights
├── database/          Docker Compose (PostgreSQL 15)
├── ml-training/       Python training scripts (TensorFlow/Keras)
├── infra/             AWS deployment + CloudWatch alarm scripts
└── .github/workflows/ CI/CD pipelines (backend deploy + frontend build/OTA)
```

### Data Flow
```
Smartwatch → Phone (SQLite local storage) → TinyML on-device → Batch sync → Backend (PostgreSQL) → Dashboard
```
Vitals are generated every 5 seconds by `VitalScheduler` when device is connected. The mobile app polls `/api/vitals/latest` every 5s, stores in local SQLite, feeds the ML buffer, and batch-syncs to the backend via `POST /api/vitals/batch`.

### Backend Key Patterns
- **JWT auth** via `JwtAuthFilter` + `JwtUtil`. All `/api/**` except `/api/auth/*` and `/actuator/health` require Bearer token.
- **RuleEngine** fires alerts when HR exceeds personal baseline (if personalized) or 85% of age-based max HR (220-age), sustained for 3+ readings.
- **BaselineService** computes per-user adaptive thresholds from 14-day rolling window (EWMA). Personalized when `sampleCount >= 1008` (~7 days).
- **Flyway** manages schema migrations in `src/main/resources/db/migration/` (V1 baseline, V2 user_baselines).
- **VitalScheduler** (`@Scheduled(fixedRate=5000)`) generates simulated vitals for connected devices.

### Frontend Key Patterns
- **Expo Router** file-based routing: `app/(auth)/` for login/register, `app/(tabs)/` for main screens.
- **ML inference** runs on every 5-second poll via `lib/ml/index.ts` → calls all 4 models → returns `MLInsights`.
- **Statistical fallback**: All ML models have rule-based algorithms that work without TensorFlow.js. TF.js loading is optional.
- **Graceful degradation everywhere**: SQLite (`localDb.ts`), Health Connect (`healthConnect.ts`), and TF.js (`tfSetup.ts`) all use try-catch with no-op fallbacks for web/Expo Go.
- **`lib/ml/baselines.ts`** computes on-device personal baselines from SQLite data, used by `calcHealthScore()` on the Home screen.

### Database Schema (7 tables)
`users`, `vitals` (indexed on user_id+timestamp), `alerts`, `sleep_sessions`, `devices`, `notification_preferences`, `user_baselines`

## Environment

- Backend port: 8085 (local), 8080 (Docker)
- Frontend port: 8081
- PostgreSQL port: 5433
- Frontend `.env`: `EXPO_PUBLIC_API_URL=http://localhost:8085` (local) or ngrok URL (APK)
- EAS build profile `preview` uses env from `eas.json` for APK builds
- DB credentials: `smartwatch` / `smartwatch_secret` (dev defaults in application.properties)

### CI/CD & Infrastructure
- **Backend CI/CD** (`.github/workflows/backend-deploy.yml`): Tests against PostgreSQL, builds Docker image, pushes to ECR, deploys to App Runner on push to main.
- **Frontend CI/CD** (`.github/workflows/frontend-build.yml`): TypeScript check, OTA update via EAS Update (beta channel), optional APK build via workflow_dispatch.
- **AWS Deploy** (`infra/deploy.sh`): One-time setup (ECR + RDS + Secrets Manager + App Runner) and incremental deploys.
- **CloudWatch** (`infra/cloudwatch.sh`): Creates alarms for 5xx errors, P95 latency, RDS CPU, and RDS storage.
- **Background Sync** (`lib/sync/backgroundSync.ts`): Registers expo-background-fetch task to batch-upload vitals every 2 hours.

### Beta Build & OTA Updates
- Build beta APK: `cd frontend/smartwatch-mobile && eas build --profile beta --platform android`
- Push OTA update: `cd frontend/smartwatch-mobile && eas update --branch beta --message "description"`
- EAS Update URL configured in app.json; `runtimeVersion` uses `appVersion` policy.

## Important Files
- `DASHBOARD_TEAM_GUIDE.md` — complete API reference + SQL queries for the physician dashboard team
- `PLAN_TinyML_and_Beta_Release.md` — full project roadmap with Phase 2 differentiating features
- `backend/src/main/resources/application.properties` — all backend config (env-var overridable)
- `frontend/smartwatch-mobile/app.json` — Expo config, plugins, Android permissions
- `frontend/smartwatch-mobile/eas.json` — EAS Build profiles with API URL per environment
- `infra/deploy.sh` — AWS infrastructure setup + deployment
- `infra/cloudwatch.sh` — CloudWatch alarm configuration
