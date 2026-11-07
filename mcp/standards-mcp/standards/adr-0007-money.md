# ADR-0007 Money is an integer number of minor units

Status: Accepted (2024-03-11). Owners: Payments platform team.

### ADR-0007-1 Store and compute money as integers
All amounts are integers in the currency's minor unit (sen for IDR, cents for USD) together with an
ISO 4217 currency code. `float` MUST NOT be used for money anywhere: binary floating point cannot
represent 0.1 and rounding errors reach invoices and tax reports. Severity when violated: high.

### ADR-0007-2 Percentages and rounding
Discounts and tax rates are expressed in basis points (1% = 100 bp). Apply them with integer
arithmetic and round half up once per line item: `(amount * bp + 5_000) // 10_000`.
Use `decimal.Decimal` only at the edges (parsing user input). Severity when violated: high.
