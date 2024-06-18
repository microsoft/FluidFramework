---
"@fluidframework/server-services-core": "minor"
---

server-services-core: Reduce session grace period for ephemeral containers to 2 minutes (was 10 minutes)

For ephermeral container, the session grace period is reduced from 10 minutes to 2 minutes when cluster is draining.
This ensures the ephemeral container gets cleaned after disconnection sooner. Clients will not find old EH containers
and will need to create new containers. This logic only takes effect when forcing draining.

You can find more details in [pull request #21010](https://github.com/microsoft/FluidFramework/pull/21010).
