# Adopt the external seed creation reference

This guide explains how to use the [text seed reference][sample] as a starting point in another repository.
An external producer creates a Fluid file from application data, without creating a container or a distributed data structure (DDS).
The application's runtime factory later converts that data into native state before ordinary runtime loading.

**This is a bounded reference, not a published production software development kit (SDK) or a general snapshot codec.**
The example supports one versioned JavaScript Object Notation (JSON) format, two named string values, and one SharedTree schema.
Its runtime adapter and summary host still depend on test utilities.
Its native snapshot builder is explicitly test-internal.
No runtime setting makes arbitrary application data or arbitrary DDS snapshots materializable.

## The supported lifecycle

1. The producer writes protocol metadata at sequence number `0` and `.app/applicationProjection/seed.json`.
   It does not write native runtime or DDS state.
2. On an existing document load, the runtime adapter reads the seed through the original context's storage.
   It constructs deterministic native state and supplies a snapshot and blob-read overlay to the application's ordinary runtime loader.
3. The loader retains its original snapshot, stored version, checkpoint, and operation stream.
   It replays operations after the seed checkpoint in the normal way.
   Opening the application does not submit initialization or alias operations.
4. The summary host requests a full first native summary from its corresponding summarizer.
   Only after a real summary acknowledgment (ACK), and a subsequent upload that names the accepted native parent, can that runtime persist incremental summaries safely.
5. A new native-only client loads the stored native state without reading the seed body or invoking the materializer.

The first native summary **omits `applicationProjection`**.
The seed is creation input, not a continuously updated representation of the document.
This does not delete historical seed versions from service storage.
Ongoing external readback is a separate subject explored in [PR #28280](https://github.com/microsoft/FluidFramework/pull/28280), not functionality provided by this reference.

## Reading order and ownership

The application example lives under `packages/test/local-server-tests/src/test/seedProjection/text/`.
The specifications live under its `test/` directory; application modules do not need the local-service test harness.
Read the files in this order:

| File                                                                                                   | Responsibility                                                                          | What to take into your repository                                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [textSeedFormat.ts][format]                                                                            | `TextSeed`, `parseSeed`, `seedRoot`, and `codeDetails`                                  | Adapt the versioned input contract and strict validation. Choose your application's code identity; do not retain the sample package name by accident.       |
| [externalSeedFile.ts][producer]                                                                        | `createSeedSummary` and `createSeedDocument`                                            | Reuse the producer pattern after validating your driver's creation contract. Supply authentication, resolver, and create-new request yourself.              |
| [textTreeSchema.ts][schema]                                                                            | Native schema, `documentFromSeed`, view configuration, and `readParts`                  | Replace with your model and conversion rules. `readParts` is an inspection helper, not an export pipeline.                                                  |
| [runtimeMaterialization.ts][builder]                                                                   | Complete native graph construction, fixed layout, and pinned codecs                     | Study it; **do not ship it as a supported codec**. It uses `MockFluidDataStoreRuntime`, native serializers, and hand-authored runtime/data-store envelopes. |
| [seedRuntimeAdapter.ts][adapter]                                                                       | `SeedProjector`, `SeedRuntimeLoad`, `MaterializedSnapshot`, and `seedRuntimeFactory`    | Adapt the boundary before ordinary runtime loading. Replace the test-only forwarding dependency and retain the guards and storage checks.                   |
| [sampleRuntimeFactory.ts][sample]                                                                      | `SeedEntryPoint`, data store factory, `textProjector`, and `sampleRuntimeFactory`       | Use it as the composition example, not as a replacement for your application's registry and entry point.                                                    |
| [summaryHost.ts][host]                                                                                 | Serialized requests, first-full-summary policy, parent validation, and failure handling | Adopt the policy only with a production host lifecycle. Replace the `@fluidframework/test-utils` `summarizeNow` dependency.                                 |
| [test/materialization.spec.ts][materialization-tests] and [test/seedCreation.spec.ts][lifecycle-tests] | Construction and real local-service lifecycle evidence                                  | Port the relevant assertions to your driver and host tests. Do not copy `LocalCodeLoader`, server setup, trackers, or mock contexts into your application.  |

For an exact prototype of the sample, the application modules belong together: the seed format, schema, layout, codecs, runtime options, and entry point must agree.
Copying only the factory does not add seed support to an unrelated application.
For production, the builder and test-utility dependencies need supported replacements.

## Create a file without loading the application

The following function uses the reference's real producer function.
The relative import assumes you have placed the adapted producer beside this module.
Its parameters are supplied by your host; the example does not create a local service, test mock, container, data store, or SharedTree.

```typescript
import type { IRequest } from "@fluidframework/core-interfaces";
import type {
	IDocumentServiceFactory,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";

import { createSeedDocument } from "./externalSeedFile.js";

/** Create the sample document using the host's configured driver. */
export async function createExample(
	factory: IDocumentServiceFactory,
	resolver: IUrlResolver,
	createNewRequest: IRequest,
): Promise<string> {
	return createSeedDocument(
		{
			format: "seed-creation/1",
			parts: [
				{ name: "first", text: "Hello" },
				{ name: "second", text: "World" },
			],
		},
		factory,
		resolver,
		createNewRequest,
	);
}
```

`createSeedDocument` validates and canonicalizes the input through `createSeedSummary`, resolves the request, and calls `factory.createContainer(summary, resolvedUrl)`.
It returns an absolute document address (URL) and disposes the returned document service.
You own the supplied factory and resolver and their authentication lifecycle.
`createSeedSummary` is also available if you only need the initial summary, but persisting it still requires a service-specific creation path.

Use a **create-new** request supported by your resolver and driver, not an arbitrary document URL.
The existing [`IDocumentServiceFactory.createContainer` contract][service-contract] accepts an initial summary; the local-service tests do not prove that every production driver accepts this seed-only application tree.
Verify protocol metadata, permissions, file creation, URL resolution, snapshot versions, and retries with your actual service.
Configure the loader's code selection to resolve the seed's `codeDetails` to your adapted runtime factory.

## Wrap your existing runtime factory

The integration point is **before** `loadContainerRuntime`, not after your application's data stores have loaded.
`seedRuntimeFactory(projector, delegate, options?)` passes these values to your delegate:

- `load.original`: the unchanged loader-owned `IContainerContext`.
- `load.context`: the runtime-facing context with coherent snapshot and storage overrides.
- `load.fromSeed`: whether this load constructed native state from a seed.
- `load.summaries`: the `SeedSummaryHost` owned by this loaded runtime.

Your `SeedProjector` supplies `isNative(context)`, `readSeed(context)`, and `materialize(seed, sequenceNumber)`.
Materialization returns a `MaterializedSnapshot`: an `ISnapshotTree` and a complete `ReadonlyMap<string, ArrayBuffer>` of its blob bodies.
These are local reference interfaces, not extensibility points published by Fluid Framework.
The adapter remains specific to the native container runtime's snapshot conventions.

The following is an **integration sketch**, not a standalone sample.
All names prefixed with `application` are values or callbacks you supply from your existing application.
In particular, `applicationRegisterSummaryHost` must record this runtime's host for your summarizer lifecycle; it is not a Fluid application programming interface (API).
The options shown match the reference's native construction assumptions and must be reconciled with your own builder.

```typescript
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";

import { seedRuntimeFactory } from "./seedRuntimeAdapter.js";

const runtimeFactory = seedRuntimeFactory(applicationProjector, async (load, existing) => {
	const runtime = await loadContainerRuntime({
		context: load.context, // Adapt before ordinary native loading.
		existing,
		registryEntries: applicationRegistryEntries,
		provideEntryPoint: applicationProvideEntryPoint,
		oldestSupportedClient: "2.0.0",
		runtimeOptions: {
			...applicationRuntimeOptions,
			enableRuntimeIdCompressor: "on",
			explicitSchemaControl: true,
			summaryOptions: {
				...applicationRuntimeOptions.summaryOptions,
				summaryConfigOverrides: {
					...applicationRuntimeOptions.summaryOptions?.summaryConfigOverrides,
					state: "summaryOnRequest",
					maxAckWaitTime: 20_000,
				},
			},
		},
	});
	try {
		await applicationRegisterSummaryHost(runtime, load.summaries);
		return runtime;
	} catch (error) {
		runtime.dispose();
		throw error;
	}
});
```

Keep your existing registry, entry point, and other application-specific load options.
The materialized graph must contain the data store types, channel types, paths, and aliases that those factories expect.
Do not substitute the sample registry while keeping your own entry point.
If your factory has additional initialization or realization logic, keep its load-time behavior and cleanup in the delegate, using `load.context`.
If your host also supports detached creation, route that separately: this adapter accepts only existing, attached documents.

The concrete `sampleRuntimeFactory({ observe, nativeOnly })` demonstrates model realization, view disposal, and runtime disposal when realization or observation fails.
Its observer receives the loaded application plus `SeedRuntimeLoad`.
It is not an observer option on `seedRuntimeFactory`.
For a native-only load, use the adapter's `{ allowProjection: false }`, or the sample's `{ nativeOnly: true }`.
Native loads still use the summary host and storage upload gate.

Do not replace the context with an object spread or modify the original context in place.
The reference uses `wrapObjectAndOverride` from `@fluidframework/test-runtime-utils` to preserve getters, method receivers, and live context behavior.
Its overlay covers `baseSnapshot`, `snapshotWithContents`, blob reads, and snapshot refetches, without replacing service versions or operation replay.
A production implementation must preserve that behavior without depending on the test helper.

### Do not initialize a live model on each load

Calling `view.initialize`, creating data stores, or assigning aliases on every joining client creates new state or operations rather than loading the same existing graph.
It also puts initialization after the point at which the runtime needed a coherent snapshot.
An absent expected graph is an error, not an instruction to rebuild it in the live client.

The fixture instead initializes a disconnected construction context and serializes the complete graph before native loading.
It uses fixed data store/channel identifiers (IDs), aliases, canonical input order, and a fixed construction compressor session to reproduce the same initial node identities.
Each live runtime then uses a **fresh, distinct compressor session** for new allocations.
Do not reuse the construction session for live clients, or use random construction identities independently on each client.
The sample's text fields are SharedTree strings; this is not an example of character-level collaborative text editing.

## Own summary adoption and recovery

The reference disables automatic summaries on every client with `summaryOnRequest`.
Your host must arrange summarizer creation, request scheduling, and cleanup; the adapter does not do this for you.
For each summarizer, retain the `load.summaries` from **that summarizer's runtime load**, not the host from an interactive client.
Call `summaries.summarize(correspondingSummarizer, reason)` for every request.
The host serializes those requests and refuses uploads outside an active request.

For a seed-loaded runtime, the first upload must contain the full native tree without summary handles.
In particular, virtual native paths do not yet exist in service storage.
After an ACK, the host permits an incremental attempt, but its upload must name the exact accepted native parent.
**An ACK alone is not proof that the runtime adopted that baseline**: the underlying refresh can log a failure while the summary request reports ACK success.
The storage gate therefore checks the upload's parent before forwarding it to the real driver.

On any failed host attempt, including a negative acknowledgment (NACK), the host closes its summarizer and permanently refuses reuse.
Recover by loading the latest durable service snapshot with a fresh client, summarizer, and host.
A concurrent summary can invalidate that new client's parent too; do not bypass the gate to force a retry.
This policy does not repair the runtime's independent late-ACK or garbage-collection tracking defects.
Your host must also close and dispose its containers and release any host registrations when they are no longer needed.

## Production work still required

At minimum, resolve these gaps before treating this reference as a production integration:

1. **Supported native construction.**
   The builder uses genuine SharedTree and compressor serializers, but `MockFluidDataStoreRuntime` and its pinned runtime/data-store metadata are not a supported snapshot-authoring API.
   Supply a supported, versioned construction path for your complete graph, including identities, schema, aliases, and runtime metadata.
   Changing only `TextSeed`, a registry entry, or a feature flag is not enough.
2. **A production host and adoption lifecycle.**
   Replace the test-only `summarizeNow` and context-forwarding dependencies.
   Preserve request serialization, bounded waits, full-first-summary enforcement, the exact-parent upload check, runtime/host pairing, and fresh-load recovery.
   Do not restore ordinary automatic summarization without an equivalent policy.
3. **A validated service creation contract.**
   Validate the producer and subsequent storage behavior against your actual driver and service.
   This reference adds no cross-service creation API, authentication flow, or production retry/idempotency policy.
4. **Version and collaboration compatibility.**
   All clients must use compatible validation, schema, materialization rules, graph identities, and native codecs.
   The external `format` value and schema namespace do not negotiate that agreement.
   Content-addressed blob IDs prove byte identity only, not application fidelity, authentication, or safe mixed-version operation replay.
   The reference has no mixed-version agreement protocol; define rollout and rejection rules before allowing incompatible clients to collaborate.
5. **Checkpoint and unsupported-mode policy.**
   A seed can be materialized only at the original creation checkpoint, sequence number `0`.
   Later operations may exist, but the loader must replay them from that checkpoint.
   Labeling pristine seed content with a later checkpoint would skip operations it never incorporated.
   Pending-state capture/restoration, offline loading, loading groups, and refetch of a different seed version are unsupported.
   A stored snapshot version is required, and disabling immediate summary-ACK refresh is rejected.
   A fresh reload is not a promise of recovery if the service only supplies an unsupported seed checkpoint.

Use the [lifecycle specifications][lifecycle-tests] as an acceptance checklist for your integration: no-write opening, independent-client collaboration, operation replay, full then incremental persistence on one runtime, native-only reload, and failure cleanup.
The [construction specifications][materialization-tests] also cover deterministic bytes, invalid inputs, checkpoint rejection, and upload-parent checks.
These tests establish the bounded local-service path, not production support for the gaps above.

[format]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/textSeedFormat.ts
[producer]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/externalSeedFile.ts
[schema]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/textTreeSchema.ts
[builder]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/runtimeMaterialization.ts
[adapter]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/seedRuntimeAdapter.ts
[sample]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/sampleRuntimeFactory.ts
[host]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/summaryHost.ts
[materialization-tests]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/test/materialization.spec.ts
[lifecycle-tests]: ../../../../packages/test/local-server-tests/src/test/seedProjection/text/test/seedCreation.spec.ts
[service-contract]: ../../../../packages/common/driver-definitions/src/storage.ts
