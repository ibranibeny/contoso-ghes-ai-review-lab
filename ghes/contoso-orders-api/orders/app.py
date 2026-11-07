from datetime import datetime, timezone

from flask import Flask, jsonify, request

from . import db, pricing

app = Flask(__name__)
conn = db.connect()


@app.get("/orders")
def orders():
    customer = request.args.get("customer", "")
    limit = int(request.args.get("limit", 20))
    if not 1 <= limit <= 100:
        return jsonify(type="about:blank", title="limit must be 1..100", status=400), 400
    return jsonify(db.list_orders(conn, customer, limit))


@app.post("/orders")
def create_order():
    body = request.get_json(force=True)
    subtotal = int(body["subtotal"])
    cur = conn.execute(
        "INSERT INTO orders (customer, email, currency, subtotal, created_at) VALUES (?, ?, ?, ?, ?)",
        (body["customer"], body["email"], body.get("currency", "IDR"), subtotal, datetime.now(timezone.utc).isoformat()),
    )
    return jsonify(id=cur.lastrowid, total=pricing.total_with_tax(subtotal)), 201
