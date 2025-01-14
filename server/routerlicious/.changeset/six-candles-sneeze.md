---
"@fluidframework/server-services": minor
---

Adds support for the tenant manager to use Riddler's new APIs

Now the tenant manager used by Alfred can fetch the new private keys exposed by Riddler. The `getKeys` API can be called with the `usePrivateKeys` flag set to true. This is currently only used for one Alfred to Riddler API call to fetch tenant keys when signing a document creation token.
