---
"@fluidframework/container-loader": minor
"__section": feature
---

Add legacy alpha APIs for seed document creation, loading, and detached runtime construction

The new legacy alpha APIs support external document creation with protocol metadata and application-owned content, followed by deterministic construction of native runtime state before operation replay.
They do not require a seed manifest or a prescribed application format.
`SeedProjector<TSeed>` connects the validated result of your seed reader to your materializer's input type.
`seedRuntimeFactory` infers this type from your projector; existing `SeedProjector` annotations still default to `unknown`.

Import the APIs from `@fluidframework/container-loader/legacy/alpha`:

```typescript
import {
  createSeedRuntimeSnapshot,
  createSeedSummary,
  seedRuntimeFactory,
} from "@fluidframework/container-loader/legacy/alpha";


// The external producer writes application data without constructing a runtime.
const summary = createSeedSummary({ codeDetails, applicationProjection });
// Pass summary to your driver's createContainer method.

const factory = seedRuntimeFactory(
  {
    isNative,
    readSeed,
    materialize: async (seed) =>
      createSeedRuntimeSnapshot({
        runtimeFactory: createDeterministicConstructionFactory(seed),
      }),
  },
  async ({ context, fromSeed }, existing) =>
    loadApplicationRuntime(context, existing, {
      summaryGenerationOptions: {
        fullTreePolicy: fromSeed ? "untilFirstAck" : "default",
      },
    }),
);
```

`createSeedRuntimeSnapshot` uses a real temporary detached container and ordinary runtime serialization, then disposes the container.
Your construction factory must use deterministic graph identities and initialization order.
With `ContainerRuntime`, pass `detachedConstructionOptions: { idCompressorSessionId: constructionSession }` and `runtimeOptions: { enableRuntimeIdCompressor: "on" }` during construction only.
Native telemetry metadata may differ between constructions; deterministic graph identities do not imply byte-identical summaries.
Each live client must use a fresh compressor session.
The native runtime must create complete summaries until its first native summary is acknowledged; do not copy seed content into native summaries.

Use `assertDeterministicSeedConstruction` from the same entry point to verify, in your own tests, that two independent constructions of the same seed produce identical collaborative state:

```typescript
assertDeterministicSeedConstruction(first, second, {
  excludeBlobNames: [".metadata"],
});
```

Call it from tests only; constructing a seed twice on every real document creation would double creation latency and cost for a guarantee that only needs verifying once per supported materializer version.

Seed loading initially supports only checkpoint zero, with no pending-state restoration, offline loading, or loading groups.
Interactive hosts must explicitly configure `Fluid.Container.enableOfflineFull` to `false`, since interactive offline support defaults to enabled.
Custom materializers must use blob IDs that do not collide with stored snapshot blobs; the loader rejects collisions rather than shadowing protocol or service contents.
Normal native documents pass through without these seed-only restrictions.
The loader retains ownership of protocol state, stored version identity, and operation replay.
