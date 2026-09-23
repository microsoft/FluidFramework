# Reference Application and Test Structure

This document describes the executable reference and how its tests establish the application-seed
workflow. The cross-package
[Fluid design](../../../../../../docs/content/Architecture/Application-Projections/Fluid-Design.md)
owns runtime contracts, GC implementation rationale, and summary acceptance semantics. The
[architecture](../../../../../../docs/content/Architecture/Application-Projections.md) owns
broader application/storage proposals; the
[usage guide](../../../../../../docs/content/Architecture/Application-Projections/Usage.md) owns
consumer responsibilities.

## Boundaries

The HTML sample defines the format, SharedTree schema, deterministic materialization, runtime
integration, and readable projection. The test harness supplies storage, clients, sequencing,
summary observation, and lifecycle assertions.
The distributed data structure (DDS) in this sample is SharedTree.
ContainerRuntime supplies the summary-generation and
acceptance contract; it is not implemented inside this folder.

The reference is headless and remains in a test package because its complete runtime/DDS graph builder
uses test-internal construction support. It is not a supported production SDK or a browser demo. The
restricted HTML codec and single-store graph deliberately bound the sample; they do not constrain
the wider architecture to HTML or SharedTree.

External file creation writes application content and a loader-valid envelope, without constructing a DDS.
Runtime materialization is separate: the application builds its runtime/DDS snapshot when it loads that seed.
That generated loading view is not the original stored snapshot and is not a file-creation utility.

## Application implementation

`html/` owns the sample application. The HTML-coupled runtime adapter and fingerprint protocol
remain here: their reusable ideas do not make their present source a format-independent SDK.
`html/test/` owns its unit/integration cases, HTML-specific assertions, and the adapter that
connects this application to the common harness.

| Module                                                               | Responsibility                                                                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [`html/appProjection.ts`](html/appProjection.ts)                     | Shared named-part types, storage layout, metadata envelope, and external readback.                                          |
| [`html/externalSeedFile.ts`](html/externalSeedFile.ts)               | External producer's seed envelope; no model construction or runtime loading.                                                |
| [`html/htmlSeedFormat.ts`](html/htmlSeedFormat.ts)                   | Shared restricted HTML types/parser and documented supported tags; not a browser HTML parser.                               |
| [`html/htmlSerializer.ts`](html/htmlSerializer.ts)                   | Canonical HTML encoding used when projecting model parts into summaries.                                                    |
| [`html/htmlTreeSchema.ts`](html/htmlTreeSchema.ts)                   | Named-parts map, recursive HTML schema, and synchronous conversion between HTML nodes and SharedTree.                       |
| [`html/runtimeMaterialization.ts`](html/runtimeMaterialization.ts)   | Generated loading snapshot and fixture envelope; actual DDS/compressor serializers own their codecs.                        |
| [`html/seedRuntimeAdapter.ts`](html/seedRuntimeAdapter.ts)           | Context forwarding, coherent snapshot/storage overlay, original source, and pending reconstruction.                         |
| [`html/seedBaselineFingerprint.ts`](html/seedBaselineFingerprint.ts) | Genesis descriptor, operation-packet proof, mismatch evidence, and internal native-identity reading.                        |
| [`html/sampleRuntimeFactory.ts`](html/sampleRuntimeFactory.ts)       | Internal materialization profile, native data-store identity persistence, and model realization.                            |
| [`html/htmlSummaryProjection.ts`](html/htmlSummaryProjection.ts)     | Model-to-application-summary projection: per-part dirtiness, captured subscriptions/revisions, and accepted-parent handles. |

`HtmlDocument.parts` maps names to independently tracked subtrees.
The default workflow uses two parts, but the format/model are not a fixed pair.
The optional default manifest contains a format label, not a part index that becomes stale after structural edits.
Its opaque bytes are preserved; the required `parts` subtree supplies the current inventory.

The application's load observer is an optional instrumentation hook used by the tests, not a test service.
The module-scope data-store runtime receives its retained metadata explicitly rather than closing over a factory invocation.

The disconnected construction mock only hosts baseline construction/serialization. It is never the
collaboration or summary service. The baseline determines the store count; registering a factory
does not instantiate another store.

## Workflow and storage instrumentation

`harness/` owns application-independent test infrastructure. Its typed application contract and
session lifecycle do not import HTML schema, content types, or runtime-factory implementation.
[`html/test/htmlTestApplication.ts`](html/test/htmlTestApplication.ts) adapts the HTML application
to that contract.
[`html/test/htmlWorkflow.spec.ts`](html/test/htmlWorkflow.spec.ts) contains the HTML-specific workload and expectations
directly, rather than forwarding its only call to a separate workflow function.

| Harness module                                                         | Responsibility                                                                                                             |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`seedWorkflowApplication.ts`](harness/seedWorkflowApplication.ts)     | `ISeedWorkflowApplication<TObservation>` and per-load runtime options supplied by a sample's test adapter.                 |
| [`seedWorkflowSession.ts`](harness/seedWorkflowSession.ts)             | `createSeedWorkflowSession()` and `ISeedWorkflowSession`: shared session/client/summary lifecycle consuming that boundary. |
| [`inspectableStorageAdapter.ts`](harness/inspectableStorageAdapter.ts) | Driver-neutral external creation, inspection, and upload observation.                                                      |
| [`localSeedWorkflowBackend.ts`](harness/localSeedWorkflowBackend.ts)   | Memorylicious configuration using local-driver and a shared in-process server.                                             |

`localSeedWorkflowBackend.ts` configures local-driver with one real `LocalDeltaConnectionServer`
shared by the clients. This separates a construction fixture from the actual in-process storage,
sequencing, collaboration, and ACK path. Application-independent session/storage tests live in
`harness/test/`; HTML conversion and lifecycle tests live in `html/test/`.

`createInspectableStorageAdapter()` takes an already configured `IDocumentServiceFactory`, its
`IUrlResolver`, a fresh driver-specific creation-request callback, explicit group capability flags,
and optional cleanup. The resolver does not define a universal create-new request; the host supplies
destination/auth/header setup. `createLocalSeedBackend()` supplies only the Memorylicious
configuration.

Client connections use the shared `wrapObjectAndOverride` helper to observe
`uploadSummaryWithContext` while preserving each service's identity and original method receivers.
External creation and independent inspection use the raw factory, so neither pollutes the client
upload journal. The shared helper comes from `test-runtime-utils`; its existing E2E import remains a
re-export.

The journal is append-only across files and records attempts, including failed uploads. It is not an
accepted-summary inventory or a latest-version cache. Every independent inspection must be disposed.
Group support and omission of unrequested group bodies are separate capabilities; group-only
responses must not be mistaken for complete native bases.

Inspection requires the driver's `getSnapshot` capability and fails explicitly when it is absent.
Any future tree-only normalization must define checkpoint/body semantics rather than inventing
successful metadata. Configuring an ODSP driver here does not establish real-service compatibility.

## Adding another sample

Put another application's format, model, and conversion code in its own sibling directory, not in
`harness/`. Provide its test adapter for the shared application contract, then reuse the session and
storage helpers. Keep its edit workload, serialization expectations, and model-specific assertions
with its own tests.
The generic harness must not learn the HTML application's part names or that the sample uses SharedTree.

This separation creates a place for a later Markdown sample; it does not implement Markdown, a
mixed-DDS native builder, or a universal application converter. Reuse the lifecycle machinery, not
the HTML fixture's schema or private native envelope.

## Evidence and limitations

The scenario compares serializer counts before and after summaries, checks uploaded handles rather
than just equal HTML, and reads persisted part IDs from the accepted version. This distinguishes
skipped work from work that merely produces identical bytes. It separately inspects native handles
after the same runtime's first accepted full summary. Native reload disables seed conversion so a
successful reload cannot accidentally hide continued dependence on the seed.
The named-part cases also exercise empty/single/multiple-part documents and changing map membership.
Undo regressions prevent a removed/restored subtree from reusing an older HTML handle after its subscription counter resets.

Pending-state cases discard the original overlay and deny original seed-body reads. Fingerprint
cases exercise real transport and native reload in addition to protocol units. The
[README](README.md#what-the-scenario-checks) summarizes scenario coverage and provides normal build/run commands.

[`applicationIdentity.spec.ts`](html/test/applicationIdentity.spec.ts) verifies that external format,
internal materialization rules, and native schema names are independent.
The real lifecycle cases preserve optional application metadata or manifest absence
through summaries, native reload, and pending-state restoration.
The baseline descriptor lives in native data-store state, not in the readable projection.

No images, mixed-DDS Markdown implementation, browser UI, or real ODSP/Tinylicious run is
demonstrated here.
