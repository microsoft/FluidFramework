---
"@fluidframework/sea-driver": minor
"__section": fix
"__includeInReleaseNotes": false
---
Defer SEA summary publication and report service latency

Summary uploads no longer replace the latest snapshot before their matching Fluid summary proposal is submitted.
Unsubmitted proposals are discarded when their author session closes.
Delta connections now emit pong latency measurements from read-only service requests and stop reporting when disconnected.