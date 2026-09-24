# Create collaborative Fluid files from application data

You can create a Fluid file from application data without constructing a container or distributed data structure (DDS) in the producer.
When a client opens that file, its application converts the creation data, or **seed**, into real DDSs before the normal Fluid runtime loads.
Fluid then persists the complete DDS-backed state and continues ordinary summarization.

The APIs provide the complete seed-loading and first-summary lifecycle.
You supply your application's format, validation, schema, and deterministic conversion.
You do not copy a loader adapter or summary host from a test package.
The loader APIs are available through `@fluidframework/container-loader/legacy/alpha`; they have alpha stability.

## Use the feature

### Responsibilities

| Component                    | Your application supplies                                                                            | Fluid supplies                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| File producer                | Validated input, application code details, configured driver, authentication, and create-new request | `createSeedSummary` writes the creation protocol and application input.                                                         |
| Seed-enabled runtime factory | `SeedProjector`, your registry and entry point, and opt-in first-summary policy                      | `seedRuntimeFactory` adapts the runtime-facing snapshot and storage before normal loading.                                      |
| Initial graph construction   | Deterministic initialization through your ordinary runtime and DDS APIs                              | `createSeedRuntimeSnapshot` creates a disconnected container, serializes the real runtime, and disposes it.                     |
| Persistence                  | Normal enabled summary scheduling and an eligible connected writer                                   | The runtime requests the first full summary, handles acknowledgment and baseline adoption, and continues incremental summaries. |

The [text application][application] is a complete, headless composition of these pieces.
Its application modules contain no test-utility imports.
The sibling `test/` directory contains the local service, assertions, and failure injection; do not ship those files.

### 1. Produce the creation summary

Import the framework helper and supply your own application tree.
For example:

```typescript
import { createSeedSummary } from "@fluidframework/container-loader/legacy/alpha";
import { SummaryType } from "@fluidframework/driver-definitions";

const summary = createSeedSummary({
	codeDetails: { package: "seed-creation-reference/1" },
	applicationProjection: {
		type: SummaryType.Tree,
		tree: {
			applicationProjection: {
				type: SummaryType.Tree,
				tree: {
					"seed.json": {
						type: SummaryType.Blob,
						content: JSON.stringify({
							format: "seed-creation/1",
							parts: [
								{ name: "first", text: "Hello" },
								{ name: "second", text: "World" },
							],
						}),
					},
				},
			},
		},
	},
});
```

The [complete example summary][example-summary] is an actual JSON serialization of this creation summary, including all protocol blobs.
A [producer test][producer-tests] checks it against the executable producer.
Its structure is:

```text
/
  .protocol/
    attributes       sequenceNumber: 0, minimumSequenceNumber: 0
    quorumMembers    []
    quorumProposals  []
    quorumValues     application code details
  .app/
    applicationProjection/
      seed.json      the two named text parts
```

No data store, SharedTree, or serialized DDS graph is present.
The `applicationProjection` path is an application convention, not a required manifest or a universal input format.
The helper's `applicationProjection` argument is the complete application tree that it places under `.app`.
Use your own paths and format, and make your projector read those same paths.

Pass the resulting summary to your configured driver's `IDocumentServiceFactory.createContainer`.
The executable [externalSeedFile.ts][producer] shows request resolution, file creation, URL retrieval, and service disposal.
Supply a create-new request supported by your driver, not an arbitrary existing-document URL.
Configure the host's code loader to resolve `codeDetails` to your seed-enabled runtime factory.
The example package name is not a production code-selection policy.

### 2. Add seed loading to your runtime factory

Wrap the call that normally loads your runtime, before any data store loads.
Keep your existing registry, entry point, runtime options, and application cleanup.
In this composition sketch, `applicationLoadOptions` is your existing load configuration and `applicationProjector` is your implementation of `SeedProjector`:

```typescript
import { seedRuntimeFactory } from "@fluidframework/container-loader/legacy/alpha";
import { loadContainerRuntime } from "@fluidframework/container-runtime/legacy";

const runtimeFactory = seedRuntimeFactory(applicationProjector, (load, existing) =>
	loadContainerRuntime({
		...applicationLoadOptions,
		context: load.context,
		existing,
		summaryGenerationOptions: {
			...applicationLoadOptions.summaryGenerationOptions,
			fullTreePolicy: load.fromSeed
				? "untilFirstAck"
				: applicationLoadOptions.summaryGenerationOptions?.fullTreePolicy,
		},
	}),
);
```

Supply this factory from your code loader's `fluidExport`.
Use the same integration for interactive clients and summarizer clients.
Do not set `summaryOnRequest` unless your application intentionally owns summary scheduling; normal automatic scheduling is the default.
There is no additional summary-host callback or test summarizer to register.

Configure the host loader's `configProvider` so `getRawConfig("Fluid.Container.enableOfflineFull")` returns `false` for seed loads.
Interactive loaders enable offline tracking by default, so leaving this setting unspecified is not equivalent to disabling it.
Keep your other host configuration and leave immediate summary-acknowledgment refresh enabled.
This explicit restriction applies to seed loading, not to an ordinary DDS-backed load.

The delegate receives:

- `load.context`: the context to pass to your runtime constructor.
- `load.original`: the unchanged loader-owned context.
- `load.fromSeed`: whether this load converted creation input rather than loaded a stored DDS graph.

The executable [sampleRuntimeFactory.ts][sample] supplies the projector and composes the normal [application runtime][runtime].
Its optional observer is example host integration, not a requirement of the framework.
Its `nativeOnly` option bypasses the seed adapter entirely, demonstrating that persisted DDS-backed summaries load through the ordinary runtime.

#### Existing derived container runtimes

You do not need to replace your subclass with the example runtime.
If your existing factory calls `ContainerRuntime.loadRuntime2`, retain its `registry`, `containerRuntimeCtor`, and other options, and add the adapted context and policy there:

```typescript
const runtimeFactory = seedRuntimeFactory(applicationProjector, async (load, existing) => {
	const { runtime } = await ContainerRuntime.loadRuntime2({
		...applicationLoadOptions,
		registry: applicationRegistry,
		containerRuntimeCtor: ApplicationContainerRuntime,
		context: load.context,
		existing,
		summaryGenerationOptions: {
			fullTreePolicy: load.fromSeed ? "untilFirstAck" : "default",
		},
	});
	return runtime;
});
```

Here `ContainerRuntime` comes from `@fluidframework/container-runtime/legacy`.
The load path applies the new summary and construction options outside the constructor, so an existing subclass does not need new positional constructor arguments.
Retain your normal realization and disposal logic.
The complete materialized graph must match the data store types, channels, aliases, and schema that your existing factories expect.

### 3. Implement your seed projector

`SeedProjector` has three application-owned operations:

| Operation                           | What you implement                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `isNative(context)`                 | Recognize a stored DDS-backed snapshot without reading seed content. The example checks the runtime's `.metadata` blob.                   |
| `readSeed(context)`                 | Read your seed from the original snapshot and storage. Validate its format before construction.                                           |
| `materialize(seed, sequenceNumber)` | Construct the complete initial graph at sequence number zero and return its snapshot and blob bodies. This operation can be asynchronous. |

Use `createSeedRuntimeSnapshot({ runtimeFactory, initialize?, ... })` for the third operation.
It loads your factory in a real detached container without a document service.
Initialize the graph either in that factory or in the optional awaited `initialize(container)` callback.
The helper calls Fluid's ordinary runtime serializer and disposes the construction container on success or failure.
Do not hand-author runtime or data-store metadata, and do not use mock runtimes in shipping application code.

During **construction only**, pass a fixed, application-defined compressor session to the runtime:

```typescript
detachedConstructionOptions: {
	idCompressorSessionId: "beefbeef-beef-4000-8000-000000000001",
}
```

Use an enabled runtime identifier compressor and deterministic short data store identifiers.
Keep the construction session, schema, registry, channel identifiers, alias assignment, and initialization order compatible across clients.
Collaborative identifiers and state must agree; the runtime's creation timestamp and telemetry identifier can differ without changing the model.
Construction is not a promise that every summary byte, including telemetry metadata, is identical.
The construction runtime cannot attach or become a live client.
Do not pass construction options to a runtime joining the stored document: each live client needs a fresh compressor session for new allocations.

The executable [runtimeMaterialization.ts][builder] uses this helper and the same [textContainerRuntime.ts][runtime] that loads the application normally.
The example validates and sorts its two text parts before initialization.
Replace that application's schema and initialization with your own model; the framework does not convert arbitrary HTML, JSON, or packages into a suitable collaborative model for you.

#### Initialize content once; create a view on every load

These operations have different purposes:

- `viewWith(configuration)` creates a typed view of a SharedTree. You use it when rendering or accessing both new and loaded data.
- `view.initialize(content)` writes the initial content and schema into a new tree. Use it only while constructing the disconnected seed graph, not in every joining client.

The [data store factory][data-store] creates its channel and initializes it only during disconnected construction.
On ordinary loads, it opens the existing channel and creates a view without initializing anything.
Likewise, it does not recreate data stores or reassign aliases on every load.
A missing expected graph in an existing document is an error, not an instruction to initialize another one.

### 4. Let Fluid persist and continue

With normal summary scheduling enabled, the elected summarizer requests an initial full summary without waiting for application edits.
An untouched interactive seed client requests a writer connection through the loader so that it can participate in summarizer election.
This does not submit a dummy operation, bypass read-only permissions, or connect a container that the host has kept disconnected.
`fullTreePolicy: "untilFirstAck"` keeps every attempted summary full until a proposal submitted by that runtime is acknowledged **and adopted** by its summarizer nodes and garbage collector.
Uploading or receiving an unrelated acknowledgment does not release the policy.
Transient failed submissions leave the policy active; failed baseline adoption closes the runtime rather than allowing unsafe reuse.
After successful adoption, ordinary incremental summaries can use handles into persisted Fluid state.

Only the **creation summary contains the seed**.
Every summary produced by this application's Fluid runtime, including its first full summary, omits `applicationProjection`.
The first persisted DDS-backed summary marks completion of this transition; it does not create the DDSs, which were already real and collaborative during loading.
Historical service versions can still contain the original seed.

A client loading a persisted DDS-backed summary needs neither the seed body nor the conversion.
The [lifecycle tests][lifecycle-tests] exercise automatic graduation without an application edit, continued automatic persistence, independent collaboration, operation replay, full then incremental summaries, failed-upload retry, and loading through the ordinary factory without the adapter.

## How loading and persistence work

### Preserve the original checkpoint and operation stream

The loader keeps ownership of protocol state, the stored version, the sequence checkpoint, and operation replay.
The adapter overlays only the runtime-facing snapshot and storage, including `snapshotWithContents` and same-version refetches.
The materialized blob identifiers are local lookup keys, not service-upload handles.

The seed can be converted only at the original creation checkpoint, sequence number `0`.
Later operations can already exist in storage; the loader must replay them after constructing the original graph.
Labeling pristine seed content with a later checkpoint would incorrectly claim that it already contains those operations and silently skip edits.
The adapter rejects a nonzero checkpoint before reading the seed.

Before the first DDS-backed summary, the constructed graph's paths do not exist in service storage.
A normal incremental handle into those paths would therefore be invalid.
The runtime's opt-in full-tree policy, proposal tracking, and garbage-collection baseline adoption prevent that transition from occurring too early.
Applications that do not select the new policy retain the existing summary path.
The opt-in policy can move an otherwise idle seed client from read mode into the writer quorum; hosts should account for that connection activity.

### Compatibility and remaining application responsibilities

The input format, deterministic conversion contract, and SharedTree schema namespace are different concerns.
Fluid does not require a manifest or a universal external format identifier.
Applications must deploy compatible materializers or reject incompatible loaders.
Equal visible text is insufficient if two conversions produce different node identities: later operations can target different nodes and break convergence.
Deterministic construction also does not prove that a conversion faithfully represents the application's input.

Validate creation and persistence with your actual driver and service.
The local-service tests do not prove that every production driver accepts a seed-only application tree.
Your host still owns authentication, permissions, code selection, retries and idempotency of file creation, and container disposal.
The summarizer needs the same permissions and connectivity as ordinary Fluid summarization.

### Supported boundaries

- Creation input and constructed snapshots must contain complete trees and blobs, not attachment blobs, summary handles, or loading groups.
- Seed loads require an attached stored version at checkpoint zero and immediate summary-acknowledgment refresh.
- Seed-loaded runtimes reject pending-state capture/restoration and offline loading. Reload a persisted DDS-backed version to use the ordinary load path.
- Refetching the same seed version is supported; refetching a different seed version is rejected.
- Disabling summary heuristics or selecting on-demand summaries intentionally requires your host to request a summary through the ordinary summarizer APIs.

Seed-only restrictions do not apply when the adapter recognizes stored DDS-backed state.
The example's two string-valued parts are a small application contract, not a limit of the framework APIs and not character-level collaborative text.

[application]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/README.md
[producer]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/externalSeedFile.ts
[example-summary]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/exampleSeedSummary.json
[producer-tests]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/test/externalSeedFile.spec.ts
[builder]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/runtimeMaterialization.ts
[sample]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/sampleRuntimeFactory.ts
[runtime]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/textContainerRuntime.ts
[data-store]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/textDataStore.ts
[lifecycle-tests]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/test/seedCreation.spec.ts
