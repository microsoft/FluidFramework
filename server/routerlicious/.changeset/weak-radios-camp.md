---
"@fluidframework/server-routerlicious-base": major
---

Now Riddler supports using private keys to sign server access tokens

Riddler's tenant manager now exposes two new properties - `enablePrivateKeyAccess` and `enableSharedKeyAccess`. These respectively indicate whether a tenant can be accessed using hidden private keys and whether a tenant can be accessed using shared secrets. APIs now support toggling the `enablePrivateKeyAccess` prop. They also support fetching these new keys and refreshing these new keys. All calls to manipulate private keys should be made from within the server.
