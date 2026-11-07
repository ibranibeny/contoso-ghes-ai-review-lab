# Appended to orders/app.py by scripts/40-demo-pr.sh


@app.post("/orders/<int:order_id>/discount")
def apply_discount(order_id):
    from . import discounts

    body = request.get_json(force=True)
    row = discounts.find_code(conn, body["code"])
    if row is None:
        return jsonify(error="unknown code"), 404
    order = conn.execute("SELECT subtotal, email FROM orders WHERE id = ?", (order_id,)).fetchone()
    total = discounts.discounted_total(order["subtotal"], row["percent"])
    discounts.notify_campaign(order_id, order["email"], total)
    return jsonify(id=order_id, total=total)


@app.get("/campaign/redemptions")
def redemptions():
    return jsonify(discounts.recent_redemptions(conn, int(request.args.get("limit", 1000))))
