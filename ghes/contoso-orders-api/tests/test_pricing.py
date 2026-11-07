from orders import pricing


def test_tax_rounds_half_up_once():
    assert pricing.total_with_tax(10_000) == 11_100
    assert pricing.apply_rate(1_005, 1_100) == 111  # 110.55 -> 111


def test_zero():
    assert pricing.total_with_tax(0) == 0
