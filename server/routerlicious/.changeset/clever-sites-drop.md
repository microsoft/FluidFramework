---
"@fluidframework/server-services-core": major
---

Adds support to call the `/accesstoken` Riddler API

Introduces a new interface method in `ITenantManager` - `signToken`. This allows all classes implementing this interface to ask Riddler to sign access tokens.
