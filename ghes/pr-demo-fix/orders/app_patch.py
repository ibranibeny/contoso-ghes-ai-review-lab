# Appended to orders/app.py by scripts/41-demo-fix.sh


@app.post("/orders/<int:order_id>/discount")
def apply_discount(order_id):
    from . import discounts

    body = request.get_json(force=True)
    code = body.get("code")
    if not isinstance(code, str) or not 1 <= len(code) <= 32:
        return jsonify(type="about:blank", title="code must be a string of 1..32 characters", status=400), 400
    row = discounts.find_code(conn, code)
    if row is None:
        return jsonify(type="about:blank", title="unknown discount code", status=404), 404
    order = conn.execute("SELECT subtotal FROM orders WHERE id = ?", (order_id,)).fetchone()
    if order is None:
        return jsonify(type="about:blank", title="order not found", status=404), 404
    total = discounts.discounted_total(order["subtotal"], row["basis_points"])
    discounts.notify_campaign(order_id, total, request.headers.get("traceparent"))
    return jsonify(id=order_id, total=total)


@app.get("/campaign/redemptions")
def redemptions():
    limit = int(request.args.get("limit", 20))
    if not 1 <= limit <= 100:
        return jsonify(type="about:blank", title="limit must be 1..100", status=400), 400
    return jsonify(discounts.recent_redemptions(conn, limit))
