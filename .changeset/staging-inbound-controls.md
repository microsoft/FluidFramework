---
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-definitions": minor
"__section": feature
---
Add controls to pause inbound operations while staging local changes

The beta stage controls expose `pauseInbound()` and `resumeInbound()` to control inbound operation processing without leaving staging mode.
Await `pauseInbound()` before relying on inbound processing having stopped.
Repeated pause or resume calls are idempotent.

Committing or discarding staged changes automatically releases any pause acquired through these controls, even if exiting staging mode throws.
Pauses acquired by other code are preserved, and inbound signals are not paused.

While paused, the client's reference sequence number does not advance, which holds back the minimum sequence number for all clients.
If the container reconnects while paused, it might not finish connecting until inbound processing resumes.
Keep pauses short.

`pauseInbound` and `resumeInbound` are `undefined` if the container runtime does not support them, for example because it is an older version.
Check that they are defined before calling them.

```typescript
const controls = containerRuntime.enterStagingMode();
if (controls.pauseInbound !== undefined) {
	await controls.pauseInbound();
}
// ... make staged changes ...
controls.commitChanges(); // Or controls.discardChanges().
```

Use `controls.resumeInbound?.()` to resume inbound operation processing while remaining in staging mode.
