---
"@fluidframework/container-runtime": minor
"__section": feature
---

Persist a full native summary before reusing summary handles

Runtime factories can select a full-tree policy when loading native state whose summary paths do not yet exist in storage.
With `untilFirstAck` and enabled summary heuristics, the elected summarizer requests an initial full summary without waiting for application edits.
With a loader that supports `IContainerContext.requestWriteConnection`, an untouched interactive client can join writer election without submitting a dummy operation.
Read-only permissions and host connection restrictions remain in effect.
Retries remain full until the runtime adopts the acknowledged proposal's native and garbage-collection state.
After adoption, normal incremental summaries continue.
Adoption failures close the runtime instead of allowing unsafe handle reuse.

```typescript
import { loadContainerRuntime } from "@fluidframework/container-runtime/legacy";

const runtime = await loadContainerRuntime({
  // ...
  context,
  registryEntries,
  existing,
  provideEntryPoint,
  summaryGenerationOptions: { fullTreePolicy: "untilFirstAck" },
});
```

Supply the option on each load that requires the full native baseline, including summarizer client loads.
Omit it when loading ordinary persisted native state.
The default behavior is unchanged, and explicit `fullTree` requests remain supported.
Disabled heuristics and `summaryOnRequest` still require an explicit summary request.
No recurring application projection callback is required.

#### Constructing native snapshots with deterministic identities

Temporary detached runtimes can use the normal application factory to construct data stores and DDSs with a fixed compressor construction session.

```typescript
const constructionSessionId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const runtime = await loadContainerRuntime({
  // ...
  context,
  registryEntries,
  existing: false,
  provideEntryPoint,
  runtimeOptions: { enableRuntimeIdCompressor: "on" },
  detachedConstructionOptions: { idCompressorSessionId: constructionSessionId },
});
```

`IDetachedRuntimeConstructionOptions` is available from `@fluidframework/container-runtime/legacy`.
The option also works with `ContainerRuntime.loadRuntime2` and derived runtimes.
Data-store IDs are deterministic for a given creation order while detached; short IDs must remain enabled.
Application DDS creation and initialization must also be deterministic.
The construction session is supplied as a lowercase version 4 UUID string and validated before loading.
No branded-type assertion or ID-compressor import is needed.
Construction preserves ordinary native telemetry metadata, including the creation timestamp and telemetry document ID.
These values can differ between constructions.
Deterministic collaborative identities do not imply byte-identical summaries.

The construction runtime must be new, detached, disconnected, and without snapshot or pending state.
It cannot attach, connect, or export pending local state.
Serialize its native summary and close the temporary container.
Load the resulting snapshot without construction options so every live runtime receives a fresh compressor session.
