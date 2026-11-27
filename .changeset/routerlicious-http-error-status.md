---
"@fluidframework/routerlicious-driver": minor
"__section": fix
---
Include HTTP status codes in failed request messages

HTTP error messages now include the numeric response status, including when a service returns an empty JSON error body.
Retry behavior and structured telemetry remain unchanged.
