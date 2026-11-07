# Contoso API Guidelines (API) v2.4

### API-ERR-01 Problem details for errors
HTTP errors return `application/problem+json` (RFC 9457) with `type`, `title`, `status` and `detail`.
Never return stack traces. Severity when violated: low.

### API-HTTP-02 Timeouts on every outbound call
Every outbound HTTP call MUST set an explicit timeout (connect 3 s, read 10 s at most) and retry only
idempotent requests with exponential backoff. `requests` without `timeout=` can hang a worker forever.
Severity when violated: high.

### API-PAG-03 Pagination
List endpoints accept `limit` (default 20, maximum 100) and `cursor`. Never return unbounded lists.
Severity when violated: medium.

### API-OBS-04 Correlation
Propagate the `traceparent` header and log the order ID with every business event.
Severity when violated: low.
