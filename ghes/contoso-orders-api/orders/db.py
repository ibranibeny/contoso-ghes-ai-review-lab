import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY,
  customer    TEXT NOT NULL,
  email       TEXT NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'IDR',
  subtotal    INTEGER NOT NULL,          -- minor units (ADR-0007)
  created_at  TEXT NOT NULL              -- ISO 8601 UTC (ADR-0011)
);
"""


def connect(path=":memory:"):
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def list_orders(conn, customer, limit=20):
    cur = conn.execute(
        "SELECT id, customer, currency, subtotal, created_at FROM orders WHERE customer = ? ORDER BY id LIMIT ?",
        (customer, limit),
    )
    return [dict(r) for r in cur.fetchall()]
