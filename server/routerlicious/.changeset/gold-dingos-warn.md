---
"@fluidframework/server-lambdas": major
"__section": fix
---

Orderer Connection "error" listener disposed on disconnect

The Nexus lambda's per-socket-orderer-connection error listener is now removed when the socket connection ends.
