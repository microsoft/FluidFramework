---
"@fluidframework/server-services-utils": minor
---

Adds support for a new token claim - `isKeylessAccessToken`.

The added support for this new claim would allow the server to know what keys to use to validate an access token. This value will only be added for tokens signed by the server. It is not exposed to the client API.
