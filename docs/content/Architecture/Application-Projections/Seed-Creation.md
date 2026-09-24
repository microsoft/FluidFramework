# Create collaborative Fluid files from application data

You can create a Fluid file from application data without running a Fluid runtime in the producer or reproducing Fluid's serialization of distributed data structures (DDSs).
The creation data is the **seed**.
When clients open the file, each client independently converts that seed into the same initial DDS state and then loads it through its ordinary runtime.
Clients do not need to coordinate initialization or submit initialization operations to collaborate.

Your host still uses the normal container-loading APIs.
You add seed support around your existing runtime factory and supply the deterministic conversion for your application's format.
Fluid later persists the DDS state so that new clients can load it without converting the seed.
The persistence details are described below; the DDSs are already usable before that first persisted summary.

## Use the feature

### Responsibilities

| Component                  | Your application supplies                                                                | Fluid supplies                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| File producer              | Seed payload, application code details, and file creation through your service           | The optional `createSeedSummary` helper writes the creation protocol and application input.                                     |
| Seed loading               | Your existing runtime-loading function and a `SeedProjector`                             | `seedRuntimeFactory` wraps that function and supplies the converted state before normal runtime loading.                        |
| Initial state construction | Deterministic initialization through your ordinary runtime and DDS APIs                  | `createSeedRuntimeSnapshot` creates a disconnected container, serializes the real runtime, and disposes it.                     |
| Persistence                | The first-full-summary policy shown below and normal enabled summarization with a writer | The runtime requests the first full summary, handles acknowledgment and baseline adoption, and continues incremental summaries. |

The [seed-creation sample][application] is a complete, headless composition of these pieces, using two named text parts.
Its application modules contain no test-utility imports.
Its `test/` subdirectory contains the local service, assertions, and failure injection; do not ship those files.

### 1. Produce the creation summary

Import the alpha framework helper and supply your own application tree with a seed payload.
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
The numeric `type` tags are defined by [`SummaryType`][summary-types]; use that definition and its tree/blob interfaces when implementing a producer in another language.
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

In the standard TypeScript driver-based creation path, pass the resulting summary to your configured driver's `IDocumentServiceFactory.createContainer`.
The executable [externalSeedFile.ts][producer] shows request resolution, file creation, URL retrieval, and service disposal.
Supply a create-new request supported by your driver, not an arbitrary existing-document URL.

The producer does not have to use TypeScript, a URL resolver, or a Fluid document-service factory.
A producer in another language can construct the same protocol metadata and application tree, then use its service's authenticated file-creation API.
The JSON example describes the logical summary, not a universal service HTTP request: follow the target service's creation and serialization contract.
That producer needs neither a Fluid runtime nor the application's DDS implementations.

Configure the host's code loader to resolve `codeDetails` to your seed-enabled runtime factory.
The example package name is not a production code-selection policy.

### 2. Add seed loading to your runtime factory

Wrap the function that normally loads your container runtime with `seedRuntimeFactory`.
Keep your existing load configuration and application cleanup.
In this composition sketch, `applicationLoadOptions` is that unchanged configuration and `seedProjector` implements the [`SeedProjector` operations below](#3-implement-your-seed-projector):

```typescript
import { seedRuntimeFactory } from "@fluidframework/container-loader/legacy/alpha";
import { loadContainerRuntime } from "@fluidframework/container-runtime/legacy";

const runtimeFactory = seedRuntimeFactory(seedProjector, (load, existing) =>
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

The delegate receives:

- `load.context`: the context to pass to your runtime constructor.
- `load.original`: the unchanged loader-owned context.
- `load.fromSeed`: whether this load converted creation input rather than loaded a stored DDS graph.

The executable [sampleRuntimeFactory.ts][sample] supplies the projector and composes the normal [application runtime][runtime].
Its optional observer is example host integration, not a requirement of the framework.
Its `nativeOnly` option bypasses the seed adapter entirely, demonstrating that persisted DDS-backed summaries load through the ordinary runtime.

#### Existing derived container runtimes

You do not need to replace your subclass with the example runtime.
If your existing factory calls `ContainerRuntime.loadRuntime2`, keep its existing options, including the runtime subclass, and add the adapted context and policy there:

```typescript
const runtimeFactory = seedRuntimeFactory(seedProjector, async (load, existing) => {
	const { runtime } = await ContainerRuntime.loadRuntime2({
		...applicationLoadOptions,
		context: load.context,
		existing,
		summaryGenerationOptions: {
			...applicationLoadOptions.summaryGenerationOptions,
			fullTreePolicy: load.fromSeed
				? "untilFirstAck"
				: applicationLoadOptions.summaryGenerationOptions?.fullTreePolicy,
		},
	});
	return runtime;
});
```

Here `ContainerRuntime` comes from `@fluidframework/container-runtime/legacy`.
The load path applies the new summary and construction options outside the constructor, so an existing subclass does not need new positional constructor arguments.
Retain your normal realization and disposal logic.

### 3. Implement your seed projector

The `seedProjector` argument in the preceding examples implements `SeedProjector<TSeed>`, which has three application-owned operations:

| Operation                           | What you implement                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `isNative(context)`                 | Recognize a stored DDS-backed snapshot without reading seed content. The example checks the runtime's `.metadata` blob.                   |
| `readSeed(context)`                 | Read your seed from the original snapshot and storage. Validate its format before construction.                                           |
| `materialize(seed, sequenceNumber)` | Construct the complete initial graph at sequence number zero and return its snapshot and blob bodies. This operation can be asynchronous. |

Use your validated application input type as `TSeed`, for example `SeedProjector<MySeed>`.
`readSeed` returns `Promise<MySeed>`, and `materialize` receives that same type.
When you pass a projector directly to `seedRuntimeFactory`, TypeScript infers the seed type from its reader.
Omitting the type argument in a `SeedProjector` annotation retains `unknown`.
These types do not validate stored data at runtime; your reader must still validate the external input.

Use `createSeedRuntimeSnapshot({ runtimeFactory, initialize?, ... })` for the third operation.
It loads your factory in a real detached container without a document service.
Initialize the graph either in that factory or in the optional awaited `initialize(container)` callback.
The helper calls Fluid's ordinary runtime serializer and disposes the construction container on success or failure.
Do not hand-author runtime or data-store metadata, and do not use mock runtimes in shipping application code.

#### Example: construct and serialize a real runtime

The sample's [materializer][builder] uses the following implementation.
`parseSeed`, `codeDetails`, and `loadTextRuntime` are sample application code, not additional framework APIs:

```typescript
export async function materializeSeed(
	input: unknown,
	sequenceNumber: number,
): Promise<SeedRuntimeSnapshot> {
	if (sequenceNumber !== 0) {
		throw new Error("Only the original creation checkpoint can be materialized");
	}
	const seed = parseSeed(input);
	return createSeedRuntimeSnapshot({
		codeDetails,
		runtimeFactory: {
			get IRuntimeFactory() {
				return this;
			},
			async instantiateRuntime(context, existing) {
				const { runtime } = await loadTextRuntime(context, existing, { seed });
				return runtime;
			},
		},
	});
}
```

Import `createSeedRuntimeSnapshot` and the `SeedRuntimeSnapshot` type from `@fluidframework/container-loader/legacy/alpha`.
The sample passes `materializeSeed` as its projector's `materialize` operation.
Its [application runtime][runtime] uses ordinary creation APIs while constructing the disconnected state:

```typescript
if (!existing) {
	const store = await runtime.createDataStore(layout.storeType);
	await store.entryPoint.get();
	if ((await store.trySetAlias(layout.alias)) !== "Success") {
		throw new Error("Cannot assign the text application's root alias");
	}
}
```

The [data store factory][data-store] then creates a SharedTree channel, initializes its content, and binds it to that data store.
Fluid's runtime, data stores, and DDSs serialize their own state; your materializer does not assemble their summary or snapshot structures.
The provided sample demonstrates how to share the same application runtime between construction and normal loading.
Replace its schema and initialization with your own application's model and creation APIs.

#### Make construction deterministic across clients

Every client converting the same seed must construct the same collaborative identities and initial state.
During **construction only**, all clients must pass the **same fixed, application-defined compressor session ID** to the runtime:

```typescript
detachedConstructionOptions: {
	idCompressorSessionId: "beefbeef-beef-4000-8000-000000000001",
}
```

Use an enabled runtime identifier compressor and deterministic short data store identifiers.
Use the same construction session, model schema, data store and channel types, channel identifiers, aliases, and initialization order for a given seed on every client.
Canonicalize unordered input before allocating identifiers or initializing DDSs; the sample validates and sorts its two text parts before creating content.
Collaborative identifiers and state must agree; the runtime's creation timestamp and telemetry identifier can differ without changing the model.
Construction is not a promise that every summary byte, including telemetry metadata, is identical.
The construction runtime cannot attach or become a live client.
Do not pass construction options to a runtime joining the stored document: each live client needs a fresh compressor session for new allocations.

The sample's [determinism tests][materialization-tests] compare independent constructions, excluding only those two telemetry fields.
Your application's tests must cover its own initialization paths and supported materializer versions.
The framework does not convert arbitrary HTML, JSON, or packages into a suitable collaborative model for you.

#### SharedTree example: initialize content once; create a view on every load

The sample uses SharedTree to illustrate the difference between initializing DDS content during disconnected construction and accessing existing content during normal loading.
Its SharedTree operations have different purposes:

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

### Host configuration

The host selects the seed-enabled runtime factory through its ordinary code loader; it does not inspect each document to choose a seed or DDS-backed load path.
Currently, a host that can open seed documents must disable offline tracking in that loader's configuration: `getRawConfig("Fluid.Container.enableOfflineFull")` must return `false`.
This is a loader-wide limitation, not a setting that the host can choose after learning whether an individual document contains a seed.
Interactive loaders enable offline tracking by default, so leaving this setting unspecified does not disable it.
Keep your other host configuration and leave immediate summary-acknowledgment refresh enabled.
Ordinary DDS-backed documents do not inherently need these restrictions, but documents opened by that same loader share its offline configuration.

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

### Correctness requirements and risks

**Deterministic seed conversion is a correctness requirement, not an optimization.**
All clients that convert the same seed must produce the same initial collaborative state, including identifiers and subsequent identifier-allocation state.
Equal visible text is insufficient if two conversions produce different node identities: later operations can target different nodes and break convergence.
The loader cannot prove this requirement for application-defined conversion code.
Test independent constructions and cross-client operation replay, including across every materializer version that can open the same seed.
Do not change allocation order, schema, codecs, or initialization behavior for existing seeds unless the resulting collaborative state remains the same.
Reject unsupported inputs or versions rather than guessing how to convert them.

The input format, deterministic conversion contract, and a DDS's schema identity are different concerns.
For example, keeping a SharedTree schema namespace unchanged does not prove that two versions of your materializer construct the same state.
Fluid does not require a manifest or a universal external format identifier; your application must select the correct deterministic conversion.

**Faithful conversion is a separate application requirement.**
A conversion can be deterministic and still omit or misinterpret input.
Validate that your DDS model represents all supported seed content, and reject content it cannot represent.

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
[summary-types]: ../../../../packages/common/driver-definitions/src/protocol/summary.ts
[builder]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/runtimeMaterialization.ts
[materialization-tests]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/test/materialization.spec.ts
[sample]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/sampleRuntimeFactory.ts
[runtime]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/textContainerRuntime.ts
[data-store]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/textDataStore.ts
[lifecycle-tests]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/test/seedCreation.spec.ts
