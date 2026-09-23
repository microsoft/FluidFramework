# External seed creation reference

This bounded test reference creates a Fluid file from a versioned JSON seed with two named text parts.
It is not a new production SDK or a general snapshot codec.
The existing HTML projection example is a separate concern.

## Supported path

1. `createSeedDocument` writes protocol metadata and `applicationProjection/seed.json` through a configured document service.
   The producer creates no Container, data store, SharedTree, or native runtime snapshot.
2. `seedRuntimeFactory` validates the seed and constructs deterministic native state before loading the ordinary runtime with `existing: true`.
   The loader keeps its original snapshot, version, checkpoint, and responsibility for replaying later operations.
3. Independent clients realize the same graph without initialization or alias writes.
   Their live compressor sessions are distinct.
4. Use the loaded client's `SeedSummaryHost` with its corresponding `ISummarizer`.
   The factory disables automatic summarizer election and heuristics on every client.
   The host serializes requests and, for a seed-loaded runtime, requests a full first native summary through existing APIs.
5. After a real ACK, that same runtime can summarize incrementally.
   A public storage-boundary check requires its upload to name the exact accepted native parent.
   This matters because baseline ACK handling can log a refresh failure and still report ACK success.
   Before that parent exists, no handle into a virtual native path may reach storage.
6. A new native-only client loads the persisted DDS state normally, without reading or rebuilding the seed.
   Its summaries still go through the host, but can immediately reuse that stored native baseline.

The first native summary deliberately drops `applicationProjection`.
There is no ongoing export or preservation callback.
External readback from subsequent native summaries belongs to the separate application-summary projection work.

## Boundaries

- `runtimeMaterialization.ts` uses a disconnected test construction context and genuine Fluid tree/compressor serializers.
  Its runtime/datastore envelope is an internal fixture, not a supported application-authored snapshot format.
- Only the pinned JSON format, two text parts, one SharedTree schema and one materialization implementation are supported.
  Invalid fields, assets, formats, names, sizes and duplicate names are rejected.
  All collaborating clients must use compatible application code; no mixed-version agreement protocol is implemented.
- Detached creation, pending-state capture/restoration, offline loading, loading groups, and a disabled immediate-ACK-refresh configuration are rejected.
  Historical refetch of a different seed version is unsupported.
- Requests outside `SeedSummaryHost` cannot upload.
  A failed host closes its summarizer; recover by loading the latest durable service snapshot with a fresh client and host, not by reusing failed tracking state.
  Another summary committed concurrently can still invalidate a fresh client's parent; a NACK requires another fresh load.
  This does not fix the runtime's independent generic late-ACK/GC tracking defects.
- Content-addressed virtual blob IDs prove byte identity only.
  Determinism is not proof of application fidelity, authentication, or safe incompatible operation replay.

## Validation

The tests use a real local service, loaders, native runtimes, SharedTree operations, summary uploads and ACKs.
They cover deterministic construction, no-write opening, independent collaboration, replay from the original seed, first-full and same-runtime incremental persistence, native-only reload, failure cleanup, and the unsupported-input guards.
From the repository root, run the normal package build and focused suites:

```bash
pnpm --filter @fluid-internal/local-server-tests build
pnpm --filter @fluid-internal/local-server-tests exec mocha --grep "Seed creation:"
```
