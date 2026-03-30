-- V2: Personal baselines for adaptive thresholds
CREATE TABLE IF NOT EXISTS user_baselines (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    metric          VARCHAR(50) NOT NULL,
    baseline_mean   DOUBLE PRECISION NOT NULL DEFAULT 0,
    baseline_std    DOUBLE PRECISION NOT NULL DEFAULT 0,
    baseline_min    DOUBLE PRECISION NOT NULL DEFAULT 0,
    baseline_max    DOUBLE PRECISION NOT NULL DEFAULT 0,
    sample_count    INTEGER NOT NULL DEFAULT 0,
    last_updated    TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, metric)
);

CREATE INDEX IF NOT EXISTS idx_baselines_user ON user_baselines(user_id);
