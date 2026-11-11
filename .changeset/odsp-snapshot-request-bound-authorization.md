---
"@fluidframework/odsp-driver": minor
"@fluidframework/odsp-driver-definitions": minor
"__section": fix
---
Fix snapshot and ops downloads with request-bound authorization

Snapshot and ops downloads now request authorization for the effective GET method and the full request URL, including `ump=1`.
Both continue to send multipart POST requests with a GET method override and obtain authorization once per request attempt, including authentication retries.
The bearer-token transport behavior is unchanged.

This correction covers snapshot and ops downloads only; other request paths are unchanged.
Hosts must still provide request-bound authorization through their token-fetching integration.
