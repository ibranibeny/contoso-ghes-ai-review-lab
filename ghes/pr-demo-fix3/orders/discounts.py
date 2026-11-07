"""Discount codes for the year-end campaign."""
import logging
import os
import sqlite3
from datetime import datetime, timezone

import requests

from . import pricing

log = logging.getLogger(__name__)

CAMPAIGN_WEBHOOK = os.environ.get("CAMPAIGN_WEBHOOK", "https://hooks.contoso.com/campaign/orders")


class OrderNotFound(Exception):
    """The order does not exist."""


class AlreadyRedeemed(Exception):
    """A discount was already applied to the order (one discount per order)."""


def find_code(conn, code: str):
    """Look up an active discount code (CSG-SQL-01: driver parameters only)."""
    cur = conn.execute("SELECT code, basis_points FROM discount_codes WHERE code = ? AND active = 1", (code,))
    return cur.fetchone()


def discounted_total(subtotal: int, basis_points: int) -> int:
    """Subtotal minus the discount, in minor units, rounded half up once (ADR-0007-2)."""
    if subtotal < 0 or not 0 <= basis_points <= 10_000:
        raise ValueError("subtotal must be >= 0 and the discount between 0 and 10000 basis points")
    return subtotal - pricing.apply_rate(subtotal, basis_points)


def redeem(conn, order_id: int, code: str, basis_points: int) -> int:
    """Apply a discount to an order exactly once. The redemption and its total are written in one transaction."""
    with conn:  # sqlite3: commit on success, roll back on error
        order = conn.execute("SELECT subtotal FROM orders WHERE id = ?", (order_id,)).fetchone()
        if order is None:
            raise OrderNotFound(order_id)
        total = discounted_total(order["subtotal"], basis_points)
        try:
            conn.execute(
                "INSERT INTO redemptions (order_id, code, basis_points, total, redeemed_at) VALUES (?, ?, ?, ?, ?)",
                (order_id, code, basis_points, total, datetime.now(timezone.utc).isoformat()),
            )
        except sqlite3.IntegrityError:  # order_id is the primary key of redemptions
            raise AlreadyRedeemed(order_id) from None
    return total


def notify_campaign(order_id: int, total: int, traceparent: str | None = None) -> bool:
    """Tell the campaign service about a redemption. Best effort: a failure never blocks the order."""
    token = os.environ.get("CAMPAIGN_TOKEN")  # injected from Azure Key Vault at deploy time
    if not token:
        log.error("campaign notification skipped for order %s: CAMPAIGN_TOKEN is not configured", order_id)
        return False
    headers = {"Authorization": f"Bearer {token}"}
    if traceparent:
        headers["traceparent"] = traceparent  # API-OBS-04
    try:
        # API-HTTP-02: explicit connect/read timeouts; POST is not idempotent, so no automatic retry
        r = requests.post(CAMPAIGN_WEBHOOK, json={"order": order_id, "total": total}, headers=headers, timeout=(3, 10))
        r.raise_for_status()
    except requests.RequestException as e:
        log.warning("campaign notification failed for order %s: %s", order_id, type(e).__name__)
        return False
    log.info("discount applied to order %s", order_id)  # CSG-LOG-03: the order ID, never the e-mail
    return True


def recent_redemptions(conn, limit: int, cursor: int | None = None):
    """One page of redemptions, newest order first, plus the cursor for the next page (API-PAG-03)."""
    if cursor is None:
        cur = conn.execute(
            "SELECT order_id, code, basis_points, total, redeemed_at FROM redemptions ORDER BY order_id DESC LIMIT ?",
            (limit + 1,),
        )
    else:
        cur = conn.execute(
            "SELECT order_id, code, basis_points, total, redeemed_at FROM redemptions WHERE order_id < ? "
            "ORDER BY order_id DESC LIMIT ?",
            (cursor, limit + 1),
        )
    rows = [dict(r) for r in cur.fetchall()]
    page = rows[:limit]
    next_cursor = page[-1]["order_id"] if len(rows) > limit else None
    return page, next_cursor
