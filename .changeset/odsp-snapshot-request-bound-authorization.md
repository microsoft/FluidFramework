---
"@fluidframework/odsp-driver": minor
"__section": fix
---
Fix snapshot downloads with request-bound authorization

Snapshot downloads with non-bearer authorization now request authorization for the exact GET URL and method sent to the service.
Bearer-token requests keep the existing multipart behavior.
