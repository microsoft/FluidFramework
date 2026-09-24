# Seed-creation sample: two named text parts

This headless application creates a Fluid file from two named text parts, loads a real SharedTree, and lets the ordinary summarizer persist the first complete Fluid summary.
The application source is in this directory; assertions, local-service setup, and failure injection are in `test/`.
Application modules use framework APIs, not mocks, test helpers, or hand-authored runtime serialization.

Start with [Creating files from application data](../../../../../../../docs/content/Architecture/Application-Projections/Seed-Creation.md) for package imports, integration with an existing runtime or subclass, and the supported boundaries.
The application stays beside its local-service tests for executable coverage; the framework APIs it uses are exported from the loader and runtime packages.
You adapt the application format and model, not a copied loader adapter or summary host.

## Source map

| Files                                                                                              | Application responsibility                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [`textSeedFormat.ts`](textSeedFormat.ts)                                                           | Validate and canonicalize the application's versioned input.                                                                    |
| [`externalSeedFile.ts`](externalSeedFile.ts), [`exampleSeedSummary.json`](exampleSeedSummary.json) | Create the seed-only file through a configured driver; show the complete creation summary.                                      |
| [`textTreeSchema.ts`](textTreeSchema.ts)                                                           | Define the SharedTree schema and seed-to-model conversion.                                                                      |
| [`textDataStore.ts`](textDataStore.ts)                                                             | Initialize a new channel during construction, or open an existing tree and create a view during loading.                        |
| [`textContainerRuntime.ts`](textContainerRuntime.ts)                                               | Share the real application registry, options, aliases, and entry point between construction and loading.                        |
| [`runtimeMaterialization.ts`](runtimeMaterialization.ts)                                           | Use `createSeedRuntimeSnapshot` to construct and serialize a real disconnected runtime.                                         |
| [`sampleRuntimeFactory.ts`](sampleRuntimeFactory.ts)                                               | Supply the application projector and compose the published seed adapter with normal runtime loading.                            |
| [`test/`](test/)                                                                                   | Keep all assertions, local-service infrastructure, failure injection, and controlled summary requests outside application code. |

## Lifecycle

1. The external producer writes protocol metadata and `applicationProjection/seed.json`, without creating DDSs.
2. The adapter constructs the initial graph in a disconnected container and loads it into the ordinary runtime.
   The loader retains its original checkpoint and replays subsequent operations.
3. Joining clients use fresh compressor sessions and do not submit initialization or alias operations.
4. Normal automatic summarization requests the first full summary.
   The runtime keeps summaries full until its acknowledged proposal has been adopted by the summarizer nodes and garbage collector.
5. Subsequent summaries can reuse persisted Fluid state.
   Further edits remain collaborative and persist normally.
6. A new client loads the persisted graph without seed conversion, including through the example's `nativeOnly` path that bypasses the adapter.

Only the creation summary contains `applicationProjection`.
Every summary produced by the application runtime omits that input.
There is no recurring application-format export callback in this application.

## Boundaries and compatibility

The example supports its strict JSON format, two text parts, and one schema.
The framework does not impose that model on other applications.
Keep graph identities, construction session, initialization order, schema, and codecs compatible across loaders.
Input-format identifiers and schema namespaces are not a materializer compatibility protocol.

Seed conversion requires the original checkpoint zero; later operations are replayed, not claimed as part of the pristine seed.
Pending state, offline loading, loading groups, attachment blobs, and refetch of a different seed version are not supported by the seed path.
For now, configure `Fluid.Container.enableOfflineFull` to `false` on any host loader that can open seeds; the host does not need to identify seed files before opening them.
Interactive loaders otherwise enable offline tracking by default.
The setting affects every load through that loader, although ordinary stored DDS-backed loads do not inherently require it.
Your product must validate file creation, permissions, and persistence with its own driver and service.

## Run the example tests

The tests use a real local service, loaders, runtimes, SharedTree operations, summary uploads, and acknowledgments.
They cover deterministic construction, the checked-in creation summary, automatic graduation without model writes, collaboration, replay, incremental persistence after new edits, retry after upload failure, and loading without the seed adapter.
Focused on-demand tests override scheduling explicitly; the application defaults to normal automatic scheduling.

```bash
pnpm --filter @fluid-internal/local-server-tests build
pnpm --filter @fluid-internal/local-server-tests exec mocha --grep "Seed creation:"
```
