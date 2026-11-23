---
"@fluidframework/server-services-ordering-zookeeper": minor
"__section": fix
---

Update ZooKeeper to remove the decompress extraction stack

The ZooKeeper dependency now requires version 7.4.1 or later.
This version uses `tar` instead of `decompress` to extract the bundled native client.
The native build requirements and Fluid server APIs remain unchanged.
