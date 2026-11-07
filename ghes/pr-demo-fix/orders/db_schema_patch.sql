CREATE TABLE IF NOT EXISTS discount_codes (
  code          TEXT PRIMARY KEY,
  basis_points  INTEGER NOT NULL CHECK (basis_points BETWEEN 0 AND 10000),   -- ADR-0007-2
  active        INTEGER NOT NULL DEFAULT 1
);
