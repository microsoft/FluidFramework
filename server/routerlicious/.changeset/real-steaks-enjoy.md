---
"@fluidframework/protocol-base": "minor"
---

protocol-base: Add optional scrubUserData parameter to ProtocolOpHandler.getProtocolState

_Note: This change is primarily internal to routerlicious._

The new optional `scrubUserData` parameter in `ProtocolOpHandler.getProtocolState` controls whether to remove all user
data from the quorum members.

You can find more details in [pull request #20150](https://github.com/microsoft/FluidFramework/pull/20150).
