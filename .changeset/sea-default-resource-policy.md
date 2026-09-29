---
"__section": other
---
Enable resource-pressure admission and reader shedding by default in the Sea server

The Sea server executable now enables its document-wide resource policy by default.
It waits for durable storage readiness, limits pending admission, and can refuse new sessions or terminate lagging live readers when the outgoing cache exceeds its soft targets.
These controls are not a hard total-memory limit.

Set `SEA_EXPERIMENTAL_RESOURCE_POLICY=false` to opt out.
Disabling live caching or enabling the pass-through session-factory experiment also requires this explicit opt-out; incompatible settings fail startup.
Embedded hosts still select their session decorators explicitly.
