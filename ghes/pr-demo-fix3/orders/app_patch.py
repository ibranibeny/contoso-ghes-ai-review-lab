# Appended to orders/app.py by scripts/41-demo-fix.sh (third round)

from . import discounts  # noqa: E402  module level, so every route below can use it


def problem(status: int, title: str, detail: str):
    """RFC 9457 problem details with type, title, status and detail (API-ERR-01)."""
    body = jsonify(type="about:blank", title=title, status=status, detail=detail)
    body.headers["Content-Type"] = "application/problem+json"
    return body, status


@app.post("/orders/<int:order_id>/discount")
def apply_discount(order_id):
    body = request.get_json(force=True)
    code = body.get("code") if isinstance(body, dict) else None
    if not isinstance(code, str) or not 1 <= len(code) <= 32:
        return problem(400, "Invalid discount code", "code must be a string of 1..32 characters")
    row = discounts.find_code(conn, code)
    if row is None:
        return problem(404, "Unknown discount code", f"no active discount code named {code!r}")
    try:
        total = discounts.redeem(conn, order_id, row["code"], row["basis_points"])
    except discounts.OrderNotFound:
        return problem(404, "Order not found", f"order {order_id} does not exist")
    except discounts.AlreadyRedeemed:
        return problem(409, "Discount already applied", f"order {order_id} already has a discount")
    discounts.notify_campaign(order_id, total, request.headers.get("traceparent"))
    return jsonify(id=order_id, total=total)


@app.get("/campaign/redemptions")
def redemptions():
    try:
        limit = int(request.args.get("limit", 20))
        cursor = int(request.args["cursor"]) if "cursor" in request.args else None
    except ValueError:
        return problem(400, "Invalid pagination", "limit and cursor must be integers")
    if not 1 <= limit <= 100 or (cursor is not None and cursor < 1):
        return problem(400, "Invalid pagination", "limit must be 1..100 and cursor a positive order ID")
    items, next_cursor = discounts.recent_redemptions(conn, limit, cursor)
    return jsonify(items=items, next_cursor=next_cursor)
