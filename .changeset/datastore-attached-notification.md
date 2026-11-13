---
"@fluidframework/container-runtime": minor
"__section": fix
---
Datastore attachment no longer emits duplicate attached notifications

The container runtime now calls a local datastore channel's `setAttachState(Attached)` once when the datastore becomes attached, instead of twice. This prevents duplicate `"attached"` events from the standard datastore runtime. Repeated requests to mark the same datastore as attached continue to produce no additional notifications.
