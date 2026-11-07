"""Money helpers. Amounts are integers in minor units; rates are basis points (ADR-0007)."""


def apply_rate(amount: int, basis_points: int) -> int:
    """Return amount * rate, rounded half up once (ADR-0007-2)."""
    return (amount * basis_points + 5_000) // 10_000


def total_with_tax(subtotal: int, tax_bp: int = 1_100) -> int:
    """PPN 11% by default."""
    return subtotal + apply_rate(subtotal, tax_bp)
