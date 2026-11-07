# Pull request review checklist: Python services

### CHK-PY-01 Correctness
Business rules match the ADRs (money ADR-0007, time ADR-0011). Edge cases: empty input, zero, negative values.

### CHK-PY-02 Security
Secure Coding Guide rules CSG-SQL-01 to CSG-INJ-05. No new dependency without a pinned version.

### CHK-PY-03 Reliability
Outbound calls follow API-HTTP-02. Errors follow API-ERR-01. No bare `except:`.

### CHK-PY-04 Tests
New behaviour has unit tests; money calculations have tests for rounding.
