---
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-definitions": minor
"__section": feature
---
Pause inbound operations while staging local changes

The beta stage controls expose `pauseInbound()` and `resumeInbound()` to control inbound operation processing without leaving staging mode.
Await `pauseInbound()` before relying on inbound processing having stopped.
Repeated pause or resume calls are idempotent.

Committing or discarding staged changes automatically releases any pause acquired through these controls, even if exiting staging mode throws.
Pauses acquired by other code are preserved, and inbound signals are not paused.

```typescript
const controls = containerRuntime.enterStagingMode();
await controls.pauseInbound();
// ... make staged changes ...
controls.commitChanges(); // Or controls.discardChanges().
```

Use `controls.resumeInbound()` to resume inbound operation processing while remaining in staging mode.
