# Using Application Seeds and Readable Projections

**Audience: application developers and external file producers.** This guide explains how to use the reference's
pattern, not how its runtime internals work. See [DESIGN.md](DESIGN.md) for maintainer details,
[ARCHITECTURE.md](ARCHITECTURE.md) for the wider roadmap, and [README.md](README.md) for running the example.

The code here is an executable reference in a test package, not a published application SDK. Its restricted HTML codec
and single-store native snapshot builder are fixtures. Adapt the pattern to your application's supported schema and
creation contract rather than copying private DDS encodings.

## Choose the responsibility you own

| Role | Responsibility | Starting point |
| --- | --- | --- |
| External producer/reader | Write supported application content into the seed envelope; read accepted projections | `externalSeedFile.ts` |
| Application developer | Define a deterministic model profile, convert seeds, and project live state | `sampleRuntimeFactory.ts`, `htmlTreeSchema.ts` |
| Host/service integrator | Supply normal code loading, driver/resolver, storage creation, and authentication | `seedProjectionWorkflow.ts`, local backend setup |

The external producer does not instantiate a Fluid Container or understand DDS state. The application does: it
constructs the baseline inside its runtime factory, and normal Fluid loading handles collaboration and operation replay.
Later external readers consume the last accepted projection; they do not see edits newer than that summary checkpoint.

## Create and read a file without a Fluid application

Run this example alongside the reference modules using the test harness documented in the README:

```typescript
import { createSeedSummary, readApplicationProjection } from "./externalSeedFile.js";
import { createLocalSeedBackend } from "./localSeedWorkflowBackend.js";

const backend = createLocalSeedBackend();
try {
    const url = await backend.create(createSeedSummary({
        first: "<p>Hello</p>",
        second: "<p>World</p>",
    }));
    const inspection = await backend.inspect(url);
    try {
        const content = await readApplicationProjection(
            inspection.snapshot.snapshotTree,
            inspection.readBlob,
        );
        // content.parts.first and content.parts.second need no Loader, Container, or DDS.
    } finally {
        inspection.dispose();
    }
} finally {
    await backend.close();
}
```

The same reader works after collaborating clients have published native summaries. A reader only resolves stored
manifest/part references; it does not reconstruct a model or apply trailing operations.

The reference's initial envelope contains `.protocol` and `.app/applicationProjection`. Snapshot consumers receive the
app-root view after the driver unwraps `.app`. `manifest.work` identifies `fluid-html-reference/2` and these two paths:

```json
{
    "format": "fluid-html-reference/2",
    "parts": {
        "first": "first/document.html",
        "second": "second/document.html"
    }
}
```

Each part is a separate summary subtree. Another language can encode this envelope, but this reference contract is not
a claim that every production storage service accepts an identical file-upload format.

## Load the reference as an application

Register `sampleRuntimeFactory()` with the host's normal code loader for the reference's `codeDetails`, and use the
backend's `documentServiceFactory` and `urlResolver`. Resolve the created URL through a Loader.
`seedProjectionWorkflow.ts` provides the complete setup, including multiple clients and a real summarizer.

The factory loads a persisted native summary directly, or converts seed content before calling `loadContainerRuntime()`.
It realizes SharedTree on interactive clients and summarizers without initialization writes. Edit that live model,
not the readable HTML blobs. The runtime publishes both native state and the readable projection through ordinary
accepted summaries.

## Build your own application integration

1. **Define your content/profile contract.** Specify supported syntax/features, schema, identifiers, defaults, and codec
   versions. Reject unsupported profiles rather than silently producing a different model.
2. **Provide deterministic native construction.** Use DDS-owned factories/serializers and a complete graph containing
   the required stores, aliases, handles, and shared identity state. `nativeSeedBaseline.ts` demonstrates one fixed
   SharedTree graph; it is not a general native-file encoder.
3. **Implement seed detection and reading.** Supply the projector operations used by `seedRuntimeFactory()`:
   `isNative`, `readSeed`, and `materialize`. Preserve source identity/checkpoint and retain required bytes for restore.
   Let ordinary loading process the operation suffix; do not replay it inside your converter.
4. **Wire your native runtime factory.** Realize everything required for read-only projection before the factory
   returns. Use `fullTreeUntilFirstAck` for projected loads, and register an `additionalRootTree` summary participant.
5. **Map model regions to projection parts.** Track dirtiness before encoding. Produce a complete tree when required;
   otherwise reuse unchanged parts only against the exact accepted parent supplied by the runtime. Promote captured
   revisions in `onAccepted`, not immediately after generation or upload.
6. **Exercise your application's lifecycle.** Cover no-write opens, independent clients, concurrent edits, summary
   retries, native reload, restoration, and unchanged-part serializer/upload counts. Add application-specific schema,
   migration, and offline coverage rather than assuming the fixture proves it.

`IncrementalHtmlProjection` is the reference for step 5: two native subtrees map to two HTML subtrees. It returns a
previous-summary handle before invoking an unchanged part's serializer. Native state becomes incremental after the
first accepted full summary in the same runtime; an unconditional `forceFullTree` override is not needed for this flow.

## Storage and loading groups

The local helper owns an in-process service for multiple files. `create(summary)` persists a file without an application
Container; `inspect(url, version?, groups?)` opens an independent storage view. Dispose inspections, close clients,
then close the backend.

Loading-group support and guaranteed omission of unrequested bodies are distinct capabilities. Without body omission,
runtime conversion still works but cannot prevent bytes already included in the initial download. Authentication,
creation requests, and actual service guarantees belong to the backend integration.

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
