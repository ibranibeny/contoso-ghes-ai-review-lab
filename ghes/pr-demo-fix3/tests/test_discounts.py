import pytest

from orders import db, discounts


def _conn():
    conn = db.connect()
    conn.execute("INSERT INTO orders (id, customer, email, currency, subtotal, created_at) "
                 "VALUES (1, 'contoso', 'buyer@contoso.com', 'IDR', 150000, '2026-11-07T00:00:00+00:00')")
    return conn  # YEAREND10 and YEAREND15 come from the schema seed


def test_ten_percent_is_exact_in_minor_units():
    assert discounts.discounted_total(150_000, 1_000) == 135_000


def test_rounds_half_up_once():
    assert discounts.discounted_total(1_001, 1_250) == 876  # 12.5% of 1_001 = 125.125 -> 125


def test_rejects_out_of_range_discount():
    with pytest.raises(ValueError):
        discounts.discounted_total(1_000, 10_001)


def test_redeem_is_persisted_once():
    conn = _conn()
    assert discounts.redeem(conn, 1, "YEAREND10", 1_000) == 135_000
    with pytest.raises(discounts.AlreadyRedeemed):
        discounts.redeem(conn, 1, "YEAREND10", 1_000)
    page, next_cursor = discounts.recent_redemptions(conn, 20)
    assert [r["order_id"] for r in page] == [1] and next_cursor is None


def test_unknown_order():
    with pytest.raises(discounts.OrderNotFound):
        discounts.redeem(_conn(), 99, "YEAREND10", 1_000)


def test_notification_without_token_is_best_effort(monkeypatch):
    monkeypatch.delenv("CAMPAIGN_TOKEN", raising=False)
    assert discounts.notify_campaign(1, 135_000) is False


def test_year_end_codes_are_seeded():
    conn = db.connect()
    assert dict(discounts.find_code(conn, "YEAREND10")) == {"code": "YEAREND10", "basis_points": 1000}
    assert discounts.find_code(conn, "YEAREND15")["basis_points"] == 1500
