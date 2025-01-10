---
"@fluidframework/server-routerlicious-base": major
---

Riddler now has a new API to sign access tokens

Adds a new Riddler API - `/accesstoken`. This is used to sign access tokens based on the tenant's configuration. This change also enables disabling shared key access for a tenant using the `/keyaccess` API. Lastly, it removes support to fetch private keys using the `/keys` API. For Alfred `DocumentManager`, this change removes the `getKey` call and replaces it with the `signToken` API call.
