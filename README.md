# Smartwatch Health Monitoring Platform (BETA)

Virtual smartwatch platform - backend simulates wearable until real hardware is integrated.

## Quick Start

```bash
cd database
docker-compose up --build
```

This starts:
- **PostgreSQL** (port 5432)
- **Backend** (port 8080)
- **Frontend** (port 8081)

## Flow

1. **Register** → Create account with DOB (used for max HR: 220 - age)
2. **Login** → JWT stored in SecureStore
3. **Connect Device** → Backend sets `device.status = CONNECTED`
4. **Scheduler** (every 5s) → If connected: generate vitals (HR 65–120, SpO2 95–99, steps++)
5. **Rule engine** → If heartRate > 85% of maxHR → alert
6. **Dashboard** → Polls `/api/vitals/latest` every 5 seconds

## Access

- **Web app**: http://localhost:8081
- **API**: http://localhost:8080

## Environment (optional)

Create `database/.env`:

```
DB_USER=smartwatch
DB_PASSWORD=your_secure_password
JWT_SECRET=your-256-bit-secret-key
```

## Structure

```
smartwatch/
├── backend/     # Spring Boot 3.2, JWT, scheduler, rule engine
├── frontend/    # React Native Expo (web + mobile)
└── database/    # docker-compose
```
