# Using Application Projections

**Audience: application developers and external file producers.** This guide explains how to use the reference's
pattern, not how its runtime internals work.
See the [Fluid design](./Fluid-Design.md) for maintainer details, the [architecture](../Application-Projections.md) for the wider roadmap, and the [reference README](../../../../packages/test/local-server-tests/src/test/seedProjection/README.md) for running the example.

The code here is an executable reference in a test package, not a published application SDK.
Its restricted HTML codec and single-store runtime snapshot builder are fixtures.
Runtime/DDS state means Fluid's runtime metadata and distributed data structure (DDS) representation, not the original seed.
Adapt the pattern to your application's supported schema and
creation contract rather than copying private DDS encodings.

## Two audiences, one application contract

| Reader                                                 | What you own                                                                                                                                         | Read first                                                                                                                                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **File producer/reader** using an application's format | Create files from application content and consume stored application projections. You do not implement a native runtime factory or decode DDS state. | The [creation/readback example](#create-and-read-a-file-without-a-fluid-application), [non-JavaScript integration](#other-languages-and-direct-service-access), and [storage behavior](#storage-and-loading-groups). |
| **Application implementer** defining that format       | Define the schema, deterministic native construction, runtime integration, and same-checkpoint projection.                                           | [Load the application](#load-the-reference-as-an-application) and [build an integration](#build-your-own-application-integration), as well as the producer/reader contract your application exposes.                 |

Both roles need the application-content contract; only the second needs the Fluid implementation underneath it.
The first role may use Rust or another language and direct service APIs rather than JavaScript or a Fluid Loader.
The JavaScript example below demonstrates the same content boundary, not a required client stack.

The source starting points are `html/externalSeedFile.ts` for external creation, `html/appProjection.ts` for shared format definitions/readback, and `html/sampleRuntimeFactory.ts` / `html/htmlTreeSchema.ts` for the application implementation.
Host integration supplies code loading, drivers/resolvers, creation requests, and authentication; the reference wires these through `harness/seedWorkflowSession.ts` and `html/test/htmlTestApplication.ts`.

These module paths are relative to the [reference directory](../../../../packages/test/local-server-tests/src/test/seedProjection).
`html/` is the sample application; `harness/` and `html/test/` are testing/integration examples, not application dependencies to ship.

The external producer does not instantiate a Fluid Container or understand DDS state. The application does: it
constructs the baseline inside its runtime factory, and normal Fluid loading handles collaboration and operation replay.
Later external readers consume the last accepted projection; they do not see edits newer than that summary checkpoint.

## Create and read a file without a Fluid application

Run this example from the reference directory using the test harness documented in the README:

```typescript
import { writeFile } from "node:fs/promises";

import { readApplicationProjection, type IHtmlPart } from "./html/appProjection.js";
import { createSeedSummary } from "./html/externalSeedFile.js";
import { createLocalSeedBackend, type IInspectableStorageAdapter } from "./harness/index.js";

/**
 * Return app-specific HTML from a newly created seed or a later accepted runtime summary.
 * A version selects a stored checkpoint; this does not load a runtime or apply newer operations.
 */
async function readStoredHtmlParts(
	storage: IInspectableStorageAdapter,
	url: string,
	version?: string,
): Promise<readonly IHtmlPart[]> {
	const inspection = await storage.inspect(url, version);
	try {
		const projection = await readApplicationProjection(
			inspection.snapshot.snapshotTree,
			inspection.readBlob,
		);
		return projection.parts;
	} finally {
		inspection.dispose();
	}
}

const backend = createLocalSeedBackend();
try {
	const url = await backend.create(
		createSeedSummary([
			{ name: "first", payload: "<p>Hello</p>" },
			{ name: "second", payload: "<p>World</p>" },
		]),
	);
	const html = await readStoredHtmlParts(backend, url);
	// An external export tool consumes ordinary HTML, not a Fluid model.
	// Use exclusive creation so this example never overwrites existing files.
	await Promise.all(
		html.map(({ name, payload }) =>
			writeFile(`${name}.html`, payload, { encoding: "utf8", flag: "wx" }),
		),
	);
} finally {
	await backend.close();
}
```

`readApplicationProjection()` enumerates the named subtrees under `applicationProjection/parts` in one stored snapshot and reads each `document.html` body as UTF-8.
If an application manifest is present, this reader retains its bytes without interpreting them.
It returns the HTML together with optional manifest bytes and storage IDs; the helper above exposes only the application content that an export, preview, or indexing tool needs.

Parts are `{ name, payload }` entries, not a fixed `first`/`second` interface.
Names must be unique and match `[a-z][a-z0-9_-]{0,63}`; `constructor` and `prototype` are reserved.
Enumeration order is not meaningful: the application validates names and sorts by code units before construction.
Zero parts is valid and retains an empty `parts` subtree.

**Use the identical `readStoredHtmlParts()` helper before and after collaboration.**
Immediately after creation it reads seed content.
After clients edit and publish a summary containing runtime/DDS state, call it with that accepted summary's version to read the corresponding application projection; omitting the version selects the latest stored snapshot available to the backend.
The example exports the result into `first.html` and `second.html` without constructing a Fluid runtime.
The HTML-specific lifecycle test in [`htmlWorkflow.spec.ts`](../../../../packages/test/local-server-tests/src/test/seedProjection/html/test/htmlWorkflow.spec.ts) exercises readback across both stages, including variable part counts.

This is stored-checkpoint readback, not a live view.
Edits that have only been sequenced as operations are invisible until a summary publishes their projection.
Reading never replays those operations, rebuilds a native model, or triggers a summary.

The reference's initial envelope contains `.protocol` and `.app/applicationProjection`.
Snapshot consumers receive the app-root view after the driver unwraps `.app`.
By default, this HTML application's creator adds the following optional `manifest.json`:

```json
{
	"format": "reference-html-parts/2"
}
```

`reference-html-parts/2` is this example application's external format label, not a Fluid format, SharedTree schema identifier, or materialization profile.
Other applications decide their own content and metadata contracts.
Fluid neither requires `manifest.json` nor interprets a manifest schema or external format identity.
For this sample, `createSeedSummary(parts, { includeManifest: false })` omits the manifest entirely; the required `parts` subtree still supports creation, collaboration, summaries, and readback.
If present, application metadata is preserved byte-for-byte, including custom metadata; absence remains absence.
The manifest is not a part inventory: adding or removing model parts changes the `parts` subtree without requiring a metadata rewrite.
There is no required external format-identity blob.

Each part is a separate summary subtree.
Another language can encode this sample envelope, but this is not a claim that every production storage service accepts an identical file-upload format.
Older prototype `manifest.work` files require explicit conversion; they are not silently treated as manifest-free input.

## Other languages and direct service access

You can implement the producer/reader role without JavaScript.
For example, a Rust tool could use an authorized service REST API to create a file or download a full snapshot, then consume the application projection without decoding the native collaboration model.
The integration still has two layers:

| Layer                       | Required work                                                                                                                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service-specific transport  | Authenticate, select a snapshot version/checkpoint, decode that service's snapshot envelope, and resolve its blob IDs. Request projection groups and any required asset bodies rather than assuming the default load response includes everything. |
| Application-content reading | Find the agreed projection root and follow that application's content contract, with or without a manifest. Return HTML or another application's representation, not DDS state.                                                                    |

For this reference, normalize the downloaded tree to its application-root view and enumerate `parts/<name>/document.html` under `applicationProjection`.
Resolve those paths' blob IDs to UTF-8 bodies; `manifest.json` is optional application metadata, not a Fluid discovery requirement or a required part index.
The JavaScript [`ISnapshotTree`](../../../../packages/common/driver-definitions/src/protocol/storage.ts) and [storage interfaces](../../../../packages/common/driver-definitions/src/storage.ts) describe the normalized tree/blob boundary used by `readApplicationProjection()`; they are not a language-neutral specification of an ODSP REST response.
An application can provide equivalent schema definitions, parsing helpers, and examples for other languages while leaving service authentication and envelope decoding to the transport integration.
The current reference supplies TypeScript source and a bounded sample envelope, not a Rust SDK or a newly supported REST download format.

A full external download intentionally includes content that an interactive native load can omit.
When image support is added, it must also obtain every referenced image/attachment needed by the application representation; requesting snapshot loading groups alone is not a guarantee that attachment bodies are included.
If content is missing, fetch it using the selected snapshot's references or report an incomplete download rather than silently omitting it.
The proposed [portable interchange format](../Application-Projections.md#desirable-interoperability-a-documented-interchange-file-format) would simplify this work, but is not required for a service-specific implementation.

## Load the reference as an application

**This and the following integration section are for application implementers.**
File producers/readers can skip the native factory details and continue with [storage behavior](#storage-and-loading-groups).

Register `sampleRuntimeFactory()` with the host's normal code loader for the reference's `codeDetails`, and use the
backend's `documentServiceFactory` and `urlResolver`. Resolve the created URL through a Loader.
`html/test/htmlTestApplication.ts` provides the sample's test adapter; `harness/seedWorkflowSession.ts` supplies shared client/summary lifecycle.
`html/test/htmlWorkflow.spec.ts` demonstrates the complete HTML scenario, including multiple clients and a real summarizer.

The factory loads persisted runtime/DDS state directly, or materializes seed content before calling `loadContainerRuntime()`.
It realizes SharedTree on interactive clients and summarizers without initialization writes. Edit that live model,
not the readable HTML blobs. The runtime publishes both native state and the readable projection through ordinary
accepted summaries.

## Build your own application integration

1. **Define independent application contracts.** Choose the external representation and any optional manifest, the internal deterministic materialization profile, and native schema identities separately.
   Do not derive a profile or schema namespace from external metadata.
2. **Provide deterministic native construction.** Use DDS-owned factories/serializers and a complete graph containing
   the required stores, aliases, handles, and shared identity state.
   `runtimeMaterialization.ts` demonstrates one store and a SharedTree map of named parts; it is not a general runtime-snapshot encoder.
   This runs when the application loads a seed, not in the external file producer.
3. **Implement seed detection and reading.** Supply the projector operations used by `seedRuntimeFactory()`:
   `isNative`, `readSeed`, and `materialize`. Preserve source identity/checkpoint and retain required bytes for restore.
   Let ordinary loading process the operation suffix; do not replay it inside your converter.
4. **Wire your native runtime factory.** Realize everything required for read-only projection before the factory
   returns. Use `fullTreePolicy: "untilFirstAck"` for projected loads, and register an `additionalRootTree` summary participant.
5. **Map model regions to projection parts.** Track dirtiness before encoding. Produce a complete tree when required;
   otherwise reuse unchanged parts only against the exact accepted parent supplied by the runtime. Promote captured
   revisions in `onAccepted`, not immediately after generation or upload.
6. **Exercise your application's lifecycle.** Cover no-write opens, independent clients, concurrent edits, summary
   retries, native reload, restoration, and unchanged-part serializer/upload counts. Add application-specific schema,
   migration, and offline coverage rather than assuming the fixture proves it.

`HtmlSummaryProjection` is the reference for step 5: each entry in the `HtmlDocument.parts` SharedTree map corresponds to one stored HTML subtree.
The main scenario uses two parts, but the same implementation handles variable part counts.
It returns a previous-summary handle before invoking an unchanged part's serializer.
Runtime/DDS state becomes incremental after the first accepted full summary in the same runtime; the `"always"` full-tree policy is not needed for this flow.

The named-parts HTML example uses `reference-html-materialization/2` as its internal rule identity and `fluid-html-reference/3` as its independent SharedTree namespace.
Neither is part of the external producer/reader contract.
The profile describes reconstruction rules, not the schema alone: two profiles can use the same schema, and application metadata cannot select a different profile.

### Baseline agreement and recovery

Seed-derived clients must agree on the initial native graph before consuming each other's edits. The reference factory
carries its original baseline descriptor on outgoing runtime packets and validates incoming operation packets before
native processing. It repeats the descriptor rather than relying on a one-time "sent" flag, preserving correctness
through chunking, reconnect, and pending-state restoration without a write merely to open the document.

Treat a mismatch as an explicit compatibility failure. The reference preserves the live model and a pending-work
artifact before closing so the host can provide recovery/export. That artifact is not a complete Loader stash and must
not be blindly restored against incompatible history. Earlier valid ungrouped edits are not automatically rolled back.
See the maintainer guide for the exact protocol and tested boundaries.

## Storage and loading groups

**The intended native-loading behavior is to exclude readable application-projection bodies from the initial snapshot, using a loading group.**
The reference places that subtree in the `application-projection` group in both seeds and native summaries.
Its tree structure and blob IDs remain discoverable even when its HTML bodies are not included.

| Storage behavior                                                           | Result for a native application load                                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Driver/service honors deferred loading groups and omits unrequested bodies | Load the native model without downloading the HTML projection bodies. Request them separately only when a consumer needs them. |
| Driver/service does not provide that omission behavior                     | The snapshot can include the projection bodies. Loading remains correct, but the transfer cost has already been paid.          |

This optimization is required for the target efficient-loading experience, not a guarantee that every backend implements it.
Recognizing `groupId` metadata and actually omitting unrequested bodies are distinct capabilities; the reference checks omission separately.
Its Memorylicious workflow verifies missing HTML bodies in the initial response and explicit same-checkpoint group readback; it does not establish ODSP service guarantees.

Two cases intentionally fetch application content: a **seed load** needs its HTML to construct the initial native model, and an **external reader** needs the readable projection itself.
Native loads can also read small compatibility metadata such as the retained baseline descriptor without fetching the HTML bodies.
For a full external snapshot download, request the projection group and required assets through the service's supported retrieval contract; do not use the minimal native-loading response as if it were a complete application export.

### Reference backend setup

The local helper owns an in-process service for multiple files. `create(summary)` persists a file without an application
Container; `inspect(url, version?, groups?)` opens an independent storage view. Dispose inspections, close clients,
then close the backend.

Authentication, creation requests, and actual service guarantees belong to the backend integration.

The test upload journal observes attempts, including failures; it is not an inventory of accepted summaries.
Production readers should use a selected persisted version, not that journal.

For a non-local driver, use `createInspectableStorageAdapter()` from `inspectableStorageAdapter.ts`. Supply the
already-configured `IDocumentServiceFactory` and `IUrlResolver`, explicit loading-group flags, and a callback producing
fresh service-specific create requests. A host can bind its test driver's `createCreateNewRequest()` or its production
driver's request builder. Authentication, destination path, and required headers cannot be inferred from the resolver
interface. Optional cleanup releases resources the adapter actually owns.

The same generic wrapper observes real client uploads through the configured factory; it does not replace the service
with mocks or need an ODSP-specific upload journal. Inspection currently requires `getSnapshot`; unsupported storage
fails explicitly. `createLocalSeedBackend()` remains a small convenience for the in-process configuration.

## Boundaries to keep explicit

The current executable reference has no images/attachment migration, browser UI, rich-text DDS graph, or real ODSP run.
The wider roadmap keeps inline-image assumptions and future attachment/download contracts separate from this usage
pattern. Loading should never repair/create shared state simply to render the document, and a read projection must
never replace an existing native model while preserving its old operation history.
