"""Discount codes for the year-end campaign."""
import logging
import os

import requests

from . import db, pricing

log = logging.getLogger(__name__)

CAMPAIGN_WEBHOOK = os.environ.get("CAMPAIGN_WEBHOOK", "https://hooks.contoso.com/campaign/orders")


def find_code(conn, code: str):
    """Look up an active discount code (CSG-SQL-01: driver parameters only)."""
    cur = conn.execute("SELECT code, basis_points FROM discount_codes WHERE code = ? AND active = 1", (code,))
    return cur.fetchone()


def discounted_total(subtotal: int, basis_points: int) -> int:
    """Subtotal minus the discount, in minor units, rounded half up once (ADR-0007-2)."""
    if subtotal < 0 or not 0 <= basis_points <= 10_000:
        raise ValueError("subtotal must be >= 0 and the discount between 0 and 10000 basis points")
    return subtotal - pricing.apply_rate(subtotal, basis_points)


def notify_campaign(order_id: int, total: int, traceparent: str | None = None) -> bool:
    """Tell the campaign service about a redemption. Best effort: a failure never blocks the order."""
    headers = {"Authorization": f"Bearer {os.environ['CAMPAIGN_TOKEN']}"}  # injected from Azure Key Vault
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


def recent_redemptions(conn, limit: int):
    return db.list_orders(conn, "campaign", limit)
