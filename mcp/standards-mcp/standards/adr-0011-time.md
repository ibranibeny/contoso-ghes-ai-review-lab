# ADR-0011 Timestamps are timezone-aware UTC

Status: Accepted (2024-08-02).

### ADR-0011-1 Use aware UTC datetimes
Create timestamps with `datetime.now(timezone.utc)`; never `datetime.utcnow()` or naive datetimes.
Serialize as ISO 8601 with offset. Convert to Asia/Jakarta only in the user interface.
Severity when violated: medium.
