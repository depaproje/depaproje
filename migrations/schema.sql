-- Cloudflare D1 database schema for DEPA Proje.
-- Run once against the production D1 database.
CREATE TABLE IF NOT EXISTS app_data (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
