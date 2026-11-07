import pytest

from orders import discounts


def test_ten_percent_is_exact_in_minor_units():
    assert discounts.discounted_total(150_000, 1_000) == 135_000


def test_rounds_half_up_once():
    # 12.5% of 1_001 = 125.125 -> 125, total 876
    assert discounts.discounted_total(1_001, 1_250) == 876


def test_rejects_out_of_range_discount():
    with pytest.raises(ValueError):
        discounts.discounted_total(1_000, 10_001)
