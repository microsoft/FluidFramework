---
"@fluidframework/server-services-core": major
---

Adds new props to the tenant interface to support private key based access

Now tenants have two new properties - `enablePrivateKeyAccess` and `enableSharedKeyAccess`. These are used by Riddler to determine whether a tenant allows just shared key access, private key access or both.
