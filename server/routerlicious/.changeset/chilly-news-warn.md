---
"@fluidframework/server-services-utils": major
---

Adds support for making `/accesstoken` API calls

This change replaces the `getKey` API call with the `signToken` Riddler API call. This is done to decouple internal service calls from the Riddler keys. Now Riddler will send back an access token to these services based on the tenant's configuration.
