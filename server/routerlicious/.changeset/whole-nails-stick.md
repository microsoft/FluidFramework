---
"@fluidframework/server-services-core": minor
---

Added interfaces to support readiness checks

This PR adds an interface which can implemented to have readiness checks for a service. This can be used by kubernetes to check the readiness of an instance.
