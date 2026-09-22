# Headless application-seed projection reference

This experimental reference uses **one direct data store and one real SharedTree**.
There is no browser app, external service, image, attachment, or application-created
native Container at external file creation time.

See the [design proposal](DESIGN.md) for the HTML/rich-text motivating scenarios,
runtime contracts, staged production direction, and Markdown follow-on design.

## Run

With the repository dependencies and ordinary workspace build outputs current:

```powershell
Set-Location C:\git\FluidFramework
pnpm --filter @fluid-internal/local-server-tests build:test:esm
pnpm --filter @fluid-internal/local-server-tests exec mocha --grep "Seed projection reference"
```

The accompanying runtime regressions are in
`packages/runtime/container-runtime/src/test/containerRuntime.experimentalSummary.spec.ts`.

For an **already-installed checkout with stale generated outputs**, this exact
Node 24 fallback also runs the current implementations and the runtime regressions:

```powershell
Set-Location C:\git\FluidFramework\packages\test\local-server-tests
$env:SEED_TYPECHECK = "1"
node --import ./src/test/seedProjection/sourceLoader.mjs node_modules/mocha/bin/mocha.js --no-config --no-package --exit --timeout 60000 "src/test/seedProjection/*.spec.ts" ../../runtime/container-runtime/src/test/containerRuntime.experimentalSummary.spec.ts
```

The optional source loader uses the installed TypeScript compiler and Mocha.
It resolves client workspace package exports to their current sources and emits
JavaScript in memory; server packages remain the installed real server packages.
`SEED_TYPECHECK=1` checks diagnostics in the reference and changed runtime files.
This is **not** a substitute for the full workspace build, lint, or generated API
report checks. No network access, dependency installation, or generated-file writes
occur in this fallback. Expected telemetry from the deliberately failed summary
attempt may appear in test output.

## Read the scenario

`workflow.ts` is the backend-neutral walkthrough:

1. `externalSeed()` creates only a valid protocol envelope plus `manifest.work`
   and restricted HTML. The backend creates the document without an app Container.
2. A and B independently project it in `IRuntimeFactory`, before
   `loadContainerRuntime(existing: true)`. Opens emit no model/alias/init ops.
3. Concurrent SharedTree edits and insertions converge through normal sequencing.
4. A separate summarizer projects the same seed and applies the real op suffix.
   A failed callback aborts before upload; retry submits and receives a real ACK.
5. Native full summaries contain no virtual handles, including GC state. The
   seed-loaded runtime remains conservative even after ACK.
6. A projector-disabled client loads the accepted native summary. Later native
   summaries regain normal handle reuse while refreshing the readable projection.
7. Both creation and regular summaries preserve the projection group's metadata.
   The local initial snapshot omits its bodies, retains IDs, and supports explicit
   group retrieval and individual blob reads.

The second workflow restores pending edits with no old overlay and with seed-body
reads deliberately denied. The loader retains its original snapshot; a small
runtime pending-state envelope retains source dependencies omitted from that
snapshot. Both initial snapshot-API and tree-only loads are tested; restoration
uses `ISnapshot` in either case. Generated native blobs are reconstructed, not
serialized into host caches.

## Components and boundaries

- `html.ts`: `fluid-html-reference/1` parser, canonical serializer and recursive
  element/attribute/ordered-child/text schema. It rejects unsupported syntax; it
  is not a browser HTML parser or production HTML round-trip format.
- `baseline.ts`: **SDK test-internal fixture builder**, not a public serializer.
  Native SharedTree and compressor serializers own all DDS codecs. Only the
  enclosing runtime/store/channel fixture envelope is specified here. A fixed
  genesis session is finalized and serialized without a live session; joining
  runtimes allocate distinct sessions. The disconnected mock is only a DDS
  construction context, never the collaboration or summary service.
- `adapter.ts`: projector/delegate separation, live context forwarding, consistent
  snapshots and runtime-local blob overlay, native bypass and pending-state envelope.
  Protocol/version/op processing remain loader-owned. Full snapshot refetches are
  projected only when still seeds; group-specific sidecar responses are not
  substituted for the native base. This reference has **no grouped native DDSs**.
- `application.ts`: registers the data store, realizes its tree on every client
  including summarizers, and supplies a synchronous, read-only checkpoint callback.
- `localBackend.ts`: the only Memorylicious-specific component. It uses
  local-driver and one shared in-process `LocalDeltaConnectionServer`, not the
  webpack hybrid that substitutes local storage for a real service.

The two runtime opt-ins are `experimentalSummaryOptions.forceFullTree` and
`experimentalSummaryOptions.additionalRootTree`. Defaults are unchanged. The latter
adds one validated root child, accounts for stats, preserves `groupId`, and runs on
attach and normal summaries even when native descendants reuse handles.

To exercise another backend, implement `ReferenceBackend` using that backend's
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
