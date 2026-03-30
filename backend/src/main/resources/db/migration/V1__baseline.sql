-- V1: Baseline migration matching existing Hibernate-generated schema

CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password        VARCHAR(255) NOT NULL,
    date_of_birth   DATE NOT NULL,
    gender          VARCHAR(255),
    created_at      TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
    id                  BIGSERIAL PRIMARY KEY,
    status              VARCHAR(255) NOT NULL,
    user_id             BIGINT NOT NULL UNIQUE REFERENCES users(id),
    last_connected_at   TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vitals (
    id          BIGSERIAL PRIMARY KEY,
    heart_rate  INTEGER,
    spo2        INTEGER,
    steps       INTEGER,
    timestamp   TIMESTAMP NOT NULL,
    user_id     BIGINT NOT NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_vitals_timestamp ON vitals(timestamp);
CREATE INDEX IF NOT EXISTS idx_vitals_user_timestamp ON vitals(user_id, timestamp);

CREATE TABLE IF NOT EXISTS alerts (
    id          BIGSERIAL PRIMARY KEY,
    message     VARCHAR(255) NOT NULL,
    timestamp   TIMESTAMP NOT NULL,
    read        BOOLEAN NOT NULL DEFAULT FALSE,
    severity    VARCHAR(255) NOT NULL,
    user_id     BIGINT NOT NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);
CREATE INDEX IF NOT EXISTS idx_alerts_user_timestamp ON alerts(user_id, timestamp);

CREATE TABLE IF NOT EXISTS sleep_sessions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    start_time      TIMESTAMP NOT NULL,
    end_time        TIMESTAMP,
    quality_score   DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sleep_user_time ON sleep_sessions(user_id, start_time);

CREATE TABLE IF NOT EXISTS notification_preferences (
    id                          BIGSERIAL PRIMARY KEY,
    enable_heart_rate_alerts    BOOLEAN NOT NULL DEFAULT TRUE,
    enable_general_alerts       BOOLEAN NOT NULL DEFAULT TRUE,
    user_id                     BIGINT NOT NULL UNIQUE REFERENCES users(id)
);
