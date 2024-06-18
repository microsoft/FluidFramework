---
"@fluidframework/server-services-shared": "minor"
---

server-services-shared: Fixed the ordering in Nexus shutdown

Before, the Redis Pub/Sub would be disposed before the socket connections were closed. Now we first close socket
connections then do Redis disposal.

You can find more details in [pull request #20429](https://github.com/microsoft/FluidFramework/pull/20429).
