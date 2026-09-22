# Headless application-seed projection reference

This reference uses **one direct data store and one real SharedTree with two HTML-part subtrees**.
There is no browser app, external service, image, or attachment. External file
creation builds and uploads a summary without instantiating a Fluid Container.

See the [implemented design](DESIGN.md) for runtime contracts and remaining SDK work,
and the [architecture roadmap](ARCHITECTURE.md) for the wider HTML/rich-text direction,
storage/asset proposals, and Markdown follow-on design.

## Run

With the repository dependencies and ordinary workspace build outputs current:

```powershell
Set-Location C:\git\FluidFramework
pnpm --filter @fluid-internal/local-server-tests build:test:esm
pnpm --filter @fluid-internal/local-server-tests exec mocha --grep "Seed projection reference"
```

The accompanying runtime regressions are in
`packages/runtime/container-runtime/src/test/containerRuntime.summaryGeneration.spec.ts`.

For an **already-installed checkout with stale generated outputs**, this exact
Node 24 fallback also runs the current implementations and the runtime regressions:

```powershell
Set-Location C:\git\FluidFramework\packages\test\local-server-tests
$env:SEED_TYPECHECK = "1"
$loaderUrl = ([System.Uri](Join-Path (Get-Location).Path 'src\test\seedProjection\seedProjectionSourceLoader.mjs')).AbsoluteUri
node --import $loaderUrl node_modules\mocha\bin\mocha.js --no-config --no-package --exit --timeout 60000 `
    "src\test\seedProjection\*.spec.ts" `
    ..\..\runtime\container-runtime\src\test\containerRuntime.summaryGeneration.spec.ts `
    ..\..\runtime\container-runtime\src\test\gc\gcSummaryStateTracker.spec.ts `
    ..\..\runtime\container-runtime\src\test\gc\garbageCollection.spec.ts
```

`seedProjectionSourceLoader.mjs` is only an optional test-launcher preloader, not
part of seed creation, application loading, materialization, or summarization.
It uses the installed TypeScript compiler and Mocha.
It resolves client workspace package exports to their current sources and emits
JavaScript in memory; server packages remain the installed real server packages.
`SEED_TYPECHECK=1` checks diagnostics in the reference, changed runtime code, and GC code/tests.
This is **not** a substitute for the full workspace build, lint, or generated API
report checks. No network access, dependency installation, or generated-file writes
occur in this fallback. Expected telemetry from the deliberately failed summary
attempt may appear in test output.

## Read the scenario

`seedProjectionWorkflow.ts` is the backend-neutral test walkthrough:

1. `createSeedSummary()` creates only a valid protocol envelope plus `manifest.work`
   and two restricted HTML parts. The backend creates the document without an app Container.
2. A and B independently project it in `IRuntimeFactory`, before
   `loadContainerRuntime(existing: true)`. Opens emit no model/alias/init ops.
3. Concurrent SharedTree edits and insertions converge through normal sequencing.
4. A separate summarizer projects the same seed and applies the real op suffix.
   A failed callback aborts before upload; retry submits and receives a real ACK.
5. The first accepted native summary contains full structural state, including GC.
   After its tracked ACK is adopted, the **same runtime's next summary is incremental**:
   native descendants and both unchanged HTML subtrees are handles.
6. Edit only the first part. Its HTML is encoded once; the second part has **zero
   serializer calls and no uploaded HTML payload**, and retains its persisted blob ID.
   A projector-disabled client loads this accepted native summary normally.
7. Both creation and regular summaries preserve the projection group's metadata.
   The local initial snapshot omits its bodies, retains IDs, and supports explicit
   group retrieval and individual blob reads.

Both seed and accepted native snapshots are read through the same external
`readApplicationProjection()` API; that reader does not load a runtime or DDS.

The second workflow restores pending edits with no old overlay and with seed-body
reads deliberately denied. The loader retains its original snapshot; a small
runtime pending-state envelope retains source dependencies omitted from that
snapshot. Both initial snapshot-API and tree-only loads are tested; restoration
uses `ISnapshot` in either case. Generated native blobs are reconstructed, not
serialized into host caches.

## External creation and readback

`externalSeedFile.ts` contains the code an external producer/reader would implement:
`createSeedSummary()` builds the initial envelope, `createApplicationProjection()`
builds the reusable application subtree, and `readApplicationProjection()` reads it
from either seed or native storage snapshots. The TypeScript example uses driver
types and the existing `SummaryTreeBuilder`; another language would encode the same
fields. Neither this module nor its pure HTML codec imports a DDS or application runtime.

The initial wire shape is `.protocol` plus `.app/applicationProjection`. The driver
unwraps `.app` for snapshot consumers, so the reader accepts an app-root snapshot
with an `applicationProjection` child. `manifest.work` contains exactly the reference
format version and `"parts": {"first": "first/document.html", "second": "second/document.html"}`.
Each part is a separate summary subtree and a separate `HtmlDocument` field. This is an executable reference
contract, not a stable/publicly supported creation protocol.

A short external-only round trip is:

```typescript
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
        // content.parts.first and content.parts.second require no Loader, Container, or DDS.
    } finally {
        inspection.dispose();
    }
} finally {
    await backend.close();
}
```

The same reader works after a runtime has collaborated and persisted a native summary.
The lifecycle test exercises that readback against actual accepted summaries, not
only synthetic trees.

## Runtime projection

`sampleRuntimeFactory()` composes `htmlProjector` with the factory adapter.
`htmlProjector` recognizes native metadata, reads the external application format,
and invokes `buildNativeBaseline()` at the original checkpoint. The adapter overlays
snapshots and blob reads coherently; ordinary Fluid loading/replay handles the op suffix.
The sample data store factory realizes a single SharedTree per store instance, without
a root Directory/Map. The baseline, not the factory registration, determines store count.

The baseline fingerprint is a lowercase 64-hex SHA-256 of the sorted native snapshot
JSON. Virtual IDs are themselves content-addressed, so the fingerprint binds native
payloads, graph identities, configuration, and source checkpoint. Equal supported
input and pinned codecs must yield identical output, without clock, randomness,
fresh GUID, or live-session dependence. This is a reconstruction diagnostic, not
an implemented first-operation agreement protocol.

## Components and boundaries

- `externalSeedFile.ts`: external creation/readback contract and application projection subtree.
- `htmlSeedFormat.ts`: pure `fluid-html-reference/2` parser and canonical serializer.
  It rejects unsupported syntax; it
  is not a browser HTML parser or production HTML round-trip format.
- `htmlTreeSchema.ts`: recursive element/attribute/ordered-child/text SharedTree schema
  and synchronous conversion to/from plain application content.
- `nativeSeedBaseline.ts`: **SDK test-internal fixture builder**, not a public serializer.
  Native SharedTree and compressor serializers own all DDS codecs. Only the
  enclosing runtime/store/channel fixture envelope is specified here. A fixed
  genesis session is finalized and serialized without a live session; joining
  runtimes allocate distinct sessions. The disconnected mock is only a DDS
  construction context, never the collaboration or summary service.
- `seedRuntimeAdapter.ts`: projector/delegate separation, live context forwarding, consistent
  snapshots and runtime-local blob overlay, native bypass and pending-state envelope.
  Protocol/version/op processing remain loader-owned. Full snapshot refetches are
  projected only when still seeds; group-specific sidecar responses are not
  substituted for the native base. This reference has **no grouped native DDSs**.
- `sampleRuntimeFactory.ts`: registers the data store, realizes its tree on every client
  including summarizers, and supplies a synchronous, read-only checkpoint callback.
- `incrementalHtmlProjection.ts`: per-part dirty subscriptions and proposal-captured revisions;
  unchanged parts return previous-summary subtree handles before their serializers are called.
- `seedWorkflowBackend.ts`: service/driver contract and test upload/inspection result types.
- `localSeedWorkflowBackend.ts`: the only Memorylicious-specific component. It uses
  local-driver and one shared in-process `LocalDeltaConnectionServer`, not the
  webpack hybrid that substitutes local storage for a real service.

`summaryGenerationOptions.fullTreeUntilFirstAck` protects an initially virtual native
base through all attempts until its first tracked full summary is adopted.
`forceFullTree` remains an independent unconditional override; the sample does not use it.
`additionalRootTree` adds one validated root child, accounts for stats, preserves
`groupId`, and runs on attach and normal summaries even when native descendants reuse handles.
Because `LoadContainerRuntimeParams` exposes `SummaryGenerationOptions` through a
legacy-beta API, its release tags are also legacy-beta. API maturity
is expressed by those tags, not by naming the type, option, or test "experimental."
This is an exposed API surface to review before merging, not an internal-only contract.

## Accepted baselines and incremental parts

The runtime supplies the summary checkpoint, effective full-tree/tracking mode, and
exact accepted parent to each application callback. A result contains the tree and
an optional `onAccepted` callback, associated with that submitted proposal. Adoption
updates native and GC state plus the storage parent before promoting the corresponding
application state and releasing initial native forcing. Upload alone is not acceptance.

`IncrementalHtmlProjection` listens to both SharedTree part subtrees and their common
parent. It captures local dirty counters when summarizing, not when ACK arrives.
Only a matching accepted parent and unchanged captured revision permit reuse.
The resulting `ISummaryHandle` points to `/applicationProjection/first` or
`/applicationProjection/second`; storage resolves it in that accepted parent and
preserves the referenced HTML blob ID. It is not a virtual blob ID or content hash.

The small manifest is regenerated; the unchanged HTML subtree is neither traversed
nor serialized. Edits during upload stay dirty, a failed proposal never becomes the
reuse base, and replacing or moving native content invalidates the affected part(s).
Full/untracked generation emits both payloads. A newly loaded application instance
conservatively establishes its own captured revision baseline on its first accepted
projection; it does not compare local event counters across clients.

The lifecycle asserts native handle reuse immediately after the first accepted full
summary, per-part serializer counts, submitted handle shape, unchanged persisted blob
IDs, grouped readback, and native reload. It does not claim that the first full native
forest summary has already primed every SharedTree chunk-level encoding optimization.

## Backend and loading-group capabilities

Obtain a `SeedWorkflowBackend` from `createLocalSeedBackend()`. One backend owns
service resources for multiple files and clients, not just a single document.
`create(summary)` returns the newly persisted file's absolute load URL without an
application Container. `inspect(url, version?, groups?)` opens a separate storage
connection and returns the selected persisted snapshot and blob reader; it does
not include later un-summarized edits. Dispose each inspection after use.

`uploads` is an append-only test journal of client upload **attempts**, tagged with
their document URLs. It includes failed attempts, excludes external `create()`
writes, and is neither a file inventory nor a list of latest/ACKed summaries.
The lifecycle scenarios use a fresh backend so their journal begins empty.

`supportsLoadingGroups` means the backend preserves group metadata and accepts
explicit group fetches. `omitsUnrequestedGroupBlobs` is a **stronger storage
guarantee**: an ordinary fetch omits unrequested grouped blob bodies while retaining
their IDs. A backend can support groups without guaranteeing this omission.

To exercise another backend, implement `SeedWorkflowBackend` using that backend's
driver/resolver, external creation and inspection/auth/cache setup. The workflow
does not instantiate a local server. Strict body omission is a local capability,
not a promise of the generic snapshot contract or real SPO behavior. A tree-only
backend can normalize its inspection result to `ISnapshot` and set
`supportsLoadingGroups: false`; the same core workflow still verifies direct blob
retrieval, without asserting group preservation or selective group fetching.

**Limits:** fixed reference schema/codec configuration; canonical fingerprints are
diagnostics, not a first-op consensus protocol. No mixed-version projector rollout,
general dependency discovery, arbitrary loading-group materialization, comprehensive
offline matrix, or real ODSP validation is claimed. Production APIs and a browser
demo are intentionally deferred.
