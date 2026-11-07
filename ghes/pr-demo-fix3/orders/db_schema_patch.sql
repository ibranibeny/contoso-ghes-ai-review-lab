CREATE TABLE IF NOT EXISTS discount_codes (
  code          TEXT PRIMARY KEY,
  basis_points  INTEGER NOT NULL CHECK (basis_points BETWEEN 0 AND 10000),   -- ADR-0007-2
  active        INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS redemptions (
  order_id      INTEGER PRIMARY KEY REFERENCES orders(id),                  -- one discount per order
  code          TEXT NOT NULL REFERENCES discount_codes(code),
  basis_points  INTEGER NOT NULL,
  total         INTEGER NOT NULL,                                           -- minor units (ADR-0007)
  redeemed_at   TEXT NOT NULL                                               -- ISO 8601 UTC (ADR-0011)
);
-- year-end campaign catalog (idempotent seed)
INSERT OR IGNORE INTO discount_codes (code, basis_points) VALUES ('YEAREND10', 1000), ('YEAREND15', 1500);
