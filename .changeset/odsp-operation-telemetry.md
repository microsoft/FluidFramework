---
"@fluidframework/odsp-driver": minor
"__section": fix
---
Correlate ODSP retries and stop retrying after document-service disposal

ODSP telemetry now distinguishes logical operations, HTTP attempts, shared throttle waits, and independent callers.
Operation IDs remain attached to errors as they pass through storage and connection logging.
Disposal records abandonment and cancels pending storage retry waits.
Disposing a document service during lazy socket-module loading prevents a connection from starting afterward.
