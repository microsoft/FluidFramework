# `full-container-state` branch — review notes

Working notes assembled before putting the branch out for review. Captures the analysis from a deep read of the branch and a sweep of the prior draft PR (#27100, by @anthony-murphy, closed when the work was handed off).

Branch: `full-container-state`
Prior draft PR: <https://github.com/microsoft/FluidFramework/pull/27100>

---

## Part 1 — Branch analysis

### What the branch adds

A new `@legacy @alpha` free function exported from `@fluidframework/container-loader`:

```ts
captureFullContainerState({ urlResolver, documentServiceFactory, request, logger? })
  : Promise<string>  // serialized IPendingContainerState
```

Driver-only capture of an attached container's referenced state. No runtime, codeLoader, or live `Container`. Output is a serialized `IPendingContainerState` in the same wire format produced by a live container's pending-state serialization, suitable for handing to `loadExistingContainer({ pendingLocalState })` or `loadFrozenContainerFromPendingState`. `pendingRuntimeState` is `undefined`, so the output cannot replay in-flight DDS edits — intended for state relay, inspection, durable snapshots.

### How it works (`createAndLoadContainerUtils.ts:317`)

1. Resolve request → create document service.
2. Fetch the latest snapshot via `getSnapshot` (or `getSnapshotTree` fallback), `cacheSnapshot: false`.
3. Read authoritative sequence number from the snapshot's `.attributes` blob.
4. In parallel: `readReferencedSnapshotBlobs`, `captureReferencedAttachmentBlobs`, `captureGroupIdSnapshots`.
5. Drain ops from delta storage starting at `attributes.sequenceNumber + 1`.
6. Assemble `IPendingContainerState { attached: true, baseSnapshot, snapshotBlobs, loadedGroupIdSnapshots, pendingRuntimeState: undefined, savedOps, url }` and `JSON.stringify`.
7. `try/finally` disposes the document service.

### New helper module — `src/captureReferencedContents.ts` (~365 lines)

GC-aware reachability walker:

- Parses the `gc` subtree (`gcState`, `tombstones`, `deletedNodes`).
- `readReferencedSnapshotBlobs`: inlines blobs reachable through referenced subtrees, skipping subtrees flagged `unreferenced: true`.
- `captureReferencedAttachmentBlobs`: inlines attachment-blob contents keyed by storage id; skips tombstoned / deleted / GC-unreferenced ones. With no GC tree, no filtering.
- `captureGroupIdSnapshots`: prefetches per-loading-group snapshots, `cacheSnapshot: false`, preserves `this` via `.bind()` on the storage service.
- Bounded concurrency: 32 in-flight blob reads, 4 in-flight snapshot fetches (`mapWithConcurrency`).
- Duplicates `.blobs`, `.redirectTable`, `_blobs`, `gc`, `__gc`, `__tombstones`, `__deletedNodes` with a comment pointing to the runtime sources of truth — to avoid a loader→runtime layering dependency.

### Blob inlining vs. the established path

The reference path is `getBlobContentsFromTree` in `containerStorageAdapter.ts:315`, used by `serializedStateManager.getPendingLocalState`. Differences:

| Aspect | Existing | New |
|---|---|---|
| Attachment blob contents | **Not inlined** — only the `.redirectTable` blob is saved. | **Fully inlined** by storage id. |
| GC reachability | None — inlines everything regardless of `unreferenced`. | Skips `unreferenced` subtrees and tombstoned/deleted attachment blobs. |
| Concurrency | Unbounded `Promise.all`. | Bounded: 32 / 4. |

Notable:

- `blobsTreeName` and `redirectTableBlobName` already live in `containerStorageAdapter.ts:309-310`. The new file redeclares them. They could just be exported from the adapter — the runtime-side constants (`_blobs`, `gc`, `__gc*`) are the ones that genuinely had to be duplicated.
- Inlining attachment blobs by storage id is **new behavior**. The load-side cache (`ContainerStorageAdapter`) resolves `readBlob(storageId)` against `snapshotBlobs`, so it works — but it's a more aggressive use of that cache than the live-path serializer ever produced.
- Two parallel walkers traverse the same tree (one for structural blobs, one for attachment blobs). Cleaner separation for GC reasoning, but the same tree gets walked twice.

### Loading groups — contract & coverage

Subagent investigation summary.

**Contract.** Loading groups are an opt-in datastore categorization (`createDataStore(pkg, loadingGroupId?)`). Non-default groups defer their snapshot fetch until a datastore in that group is touched.

- Public API: `IContainerRuntime.createDataStore(...loadingGroupId?)`, `IContainerRuntime.getSnapshotForLoadingGroupId(...)` (`runtime-definitions/src/dataStoreContext.ts:265,329`).
- Driver: `ISnapshotFetchOptions.loadingGroupIds` (`driver-definitions/src/storage.ts:528`), optional `IDocumentStorageService.getSnapshot`.
- Snapshot tree: `ISnapshotTree.groupId` / `ITree.groupId` (`protocol-definitions/src/storage.ts:127,151`).
- Stability tag: `@legacy @beta`. Documented in `container-runtime/README.md`.

**Maturity assessment.** Moderate. Real e2e tests exist (`loadNewerGroupIdSnapshot.spec.ts`, `groupIdInSummary.spec.ts`, `gcDataVirtualization.spec.ts`); ODSP and local drivers implement `getSnapshot`. But the feature is gated behind `Fluid.Container.UseLoadingGroupIdForSnapshotFetch[2]` flags, and at least one test is marked "Skip flaky." Used in tests behind flags; not yet a default-on production path.

**Pending-state contract on load.** `IPendingContainerState.loadedGroupIdSnapshots: Record<groupId, SerializedSnapshotInfo>` where `SerializedSnapshotInfo = { baseSnapshot, snapshotBlobs, snapshotSequenceNumber }` (`serializedStateManager.ts:85,127-129`). Consumed in `ContainerStorageAdapter.getSnapshot` (`containerStorageAdapter.ts:182-199`): if the request carries `loadingGroupIds` and a match exists, serves the cached snapshot via `convertSnapshotInfoToSnapshot`; else falls back to the driver. Shape is **not validated** — a malformed entry asserts later.

**Capture code review (`captureGroupIdSnapshots`)** — correct overall:

- Discovers groupIds by walking the tree (`collectGroupIds`, lines 297-312), respecting `unreferenced` ✓
- Returns `{}` when `getSnapshot` is undefined ✓
- Dedupes via `Set` ✓
- `cacheSnapshot: false`, scenario `"…group"`, preserves `this` via `.bind(storage)` ✓
- Falls back to `getDocumentAttributes` when `groupSnapshot.sequenceNumber` is undefined ✓ (untested)

**Coverage gaps:**

- No error handling — one failed group fetch fails the whole capture (Promise.all-style fail-fast).
- No test for the `sequenceNumber === undefined` fallback.
- No test for a group snapshot that itself contains `unreferenced` subtrees.
- No test for `getSnapshot` rejecting (network error, malformed response).
- E2E doesn't create any non-default-group datastores — the entire loading-group path is exercised by unit tests only.

**Top thing to fix:** add an e2e case that creates a datastore with a non-default `loadingGroupId`, runs `captureFullContainerState`, rehydrates, and verifies the group's data is reachable. Without that, the "this also works for loading groups" claim is unverified.

### E2E test summary (`captureFullContainerState.spec.ts`)

Four cases. Every one **rehydrates** through `loadFrozenContainerFromPendingState` and compares.

1. **`captures state that can rehydrate a frozen container with matching data`** (line 68). Detached container, 5 keys before attach + 5 after, capture, rehydrate, deep-equal the root SharedMap.
2. **`includes ops posted after the snapshot in savedOps`** (line 137). Attach, write 10 keys post-snapshot, capture, assert `savedOps.length > 0` and ops are sequence-ordered, rehydrate, confirm each post-snapshot value is replayed.
3. **`captures DDS and blob references written before capture`** (line 198). Nested SharedMap stored on root via Fluid handle, capture, rehydrate, resolve handle and read its key.
4. **`inlines attachment blob contents so reads don't go back to storage`** (line 241). Upload pre-attach (test comment notes local-server has no summarizer, so this is the only path to get attachment blobs into the fetched snapshot), capture, assert payload appears in `snapshotBlobs`, rehydrate, read through the handle.

**Exercised:** SharedMap on root, post-snapshot ops, nested DDS via handle, attachment blobs uploaded pre-attach.

**Not exercised:**

- No loading-group datastores (largest gap).
- No GC-driven exclusion — no unreferenced subtree, tombstoned blob, or deleted node end-to-end.
- No multi-datastore container.
- No reconnection / second-write-after-rehydration scenario.
- No real driver — only `LocalDocumentServiceFactory`. ODSP versioning quirks, snapshot caching, etc. unexercised.
- No post-attach attachment-blob upload (deliberate — local-server has no summarizer).
- No non-UTF-8 attachment-blob round-trip (see open feedback below).

---

## Part 2 — Follow-ups from prior draft PR (#27100)

The prior PR closed when the branch was handed off. It collected feedback from Copilot's PR review bot and from @anthony-murphy's own deep-review pass. Below is the synthesized list with each item's current status checked against the branch.

### Resolved on the current branch

| # | Item | Source | Status |
|---|---|---|---|
| 1 | `IDocumentService.dispose()` was never called — driver contract leak. | Copilot, `createAndLoadContainerUtils.ts:388` | ✅ Fixed — `try/finally` wraps the body, line 332-394. |
| 2 | Unbounded `Promise.all` in `readReferencedSnapshotBlobs` could overwhelm driver/service for large snapshots. | Copilot, `captureReferencedContents.ts:135` | ✅ Fixed — `mapWithConcurrency` with `maxReadConcurrency = 32`. |
| 3 | Unbounded `Promise.all` in `captureReferencedAttachmentBlobs` — same risk. | Copilot, `captureReferencedContents.ts:236` | ✅ Fixed — same helper, line 232. |
| 4 | `collectUnreferencedBlobLocalIds` returned `undefined` when `gcState` was undefined, silently dropping tombstones/deletedNodes filtering. | Copilot, `captureReferencedContents.ts:253` | ✅ Fixed — line 285 applies tombstones+deletedNodes unconditionally; the comment at lines 267-270 explicitly explains the invariant. |
| 5 | `storage.getSnapshot` extracted into a local var would strip `this` in strict mode. | Author, `captureReferencedContents.ts:332` | ✅ Was a false positive (already had `.bind()`). Author retracted. Line 336 still has `storage.getSnapshot?.bind(storage)`. |

### Open — must address before re-review

#### A. Binary attachment blob bytes are corrupted by lossy UTF-8 round-trip

`captureReferencedContents.ts:234` reads each attachment blob as `bufferToString(buffer, "utf8")`. Non-UTF-8 byte sequences (images, encrypted payloads, anything binary) will be mangled by the round-trip — the substituted replacement characters cannot recover the original bytes.

This was raised on the draft PR and explicitly **re-tiered as in-scope** in the deep-review summary (the score moved 7 → 5 over this single item). The runtime's own pending-blob serializer uses base64 for exactly this reason. The new `captureReferencedAttachmentBlobs` is the code path that introduces the wire-format obligation here.

Choose one:

1. **Base64-encode at the new encode site** and decode at the corresponding load site in `serializedStateManager`. Adds a wire-format extension (e.g., a `binaryAttachmentBlobs` map alongside `snapshotBlobs`, or a flag on entries). Requires a load-path change.
2. **Document a UTF-8-only restriction** in the function's jsdoc and `ICaptureFullContainerStateProps`, acknowledging that arbitrary binary payloads are unsupported.

Either way, **add a non-UTF-8 round-trip test** in `captureFullContainerState.spec.ts` — e.g. `Uint8Array([0xff, 0xfe, 0x00])` — asserting byte-exact equality after rehydration. Without that test, this regresses silently.

> [!NOTE]
> The existing `getBlobContentsFromTree` path in `containerStorageAdapter.ts:324,349` uses the same `bufferToString(..., "utf8")` pattern. The deep-review counter-argument was that the existing path doesn't actually inline arbitrary attachment-blob bytes (it only saves the redirect table) — so this is a *new* obligation this PR creates, not a pre-existing limitation it inherits. Worth confirming that framing when the discussion resumes.

#### B. Monitoring-context wiring missing — RESOLVED

Wired up matching the sibling pattern in this file:

- `ICaptureFullContainerStateProps` now has `readonly configProvider?: IConfigProviderBase | undefined`.
- `captureFullContainerState` builds a monitoring context with `mixinMonitoringContext` (composing `sessionStorageConfigProvider` + the props' `configProvider`) and a child context with namespace `"CaptureFullContainerState"`.
- The body is wrapped in `PerformanceEvent.timedExecAsync` with `eventName: "CaptureFullContainerState"`, so successes and failures emit telemetry.
- The `mc.logger` is forwarded to `createDocumentService` so driver-side telemetry threads through with the same identity.
- API report regenerated; the new optional field is in `container-loader.legacy.alpha.api.md`.

`jatgarg` should still sign off on the telemetry decisions before promotion.

#### C. Layering — duplicated constants — PARTIALLY RESOLVED

Drift hazard mitigated; long-term home still open.

What landed on this branch:

- The seven duplicated constants in `captureReferencedContents.ts` are now bundled into a single `wireFormatConstants` POJO and exported `@internal`.
- Container-runtime's `src/index.ts` re-exports `blobsTreeName`, `redirectTableBlobName`, `blobManagerBasePath` (with `@internal` tags added on the source declarations to satisfy api-extractor). The four GC-side constants were already exported from `runtime-definitions/internal`.
- A contract test at `packages/test/local-server-tests/src/test/wireFormatConstants.spec.ts` imports both the loader's POJO and the authoritative runtime exports and asserts each pair matches. CI will fail if either side changes a value without the other being updated in lock-step.

What's still open: whether to actually extract to a shared package (`common-definitions`, a runtime-protocol package, or `runtime-utils`). The contract test removes the urgency — drift will be caught immediately — but doesn't address the underlying duplication. Decide as a longer-term cleanup, not a blocker for this PR.

### Open — coverage / testing

#### D. Loading-group end-to-end coverage — RESOLVED by reverting the path

The capture path for loading groups has been removed. `captureFullContainerState` now throws `UsageError` if any referenced subtree of the snapshot declares a `groupId`. Rationale: the path had no end-to-end coverage, the feature is gated behind experimental flags in the rest of the repo, and there is no known production consumer for capture-with-loading-groups today.

Changes on the branch:

- `captureGroupIdSnapshots`, `collectGroupIds`, and `maxSnapshotFetchConcurrency` removed from `captureReferencedContents.ts`.
- New `snapshotHasLoadingGroups(baseSnapshot)` exported from the same file — short-circuiting walker that respects `unreferenced`.
- `captureFullContainerState` calls it after computing `baseSnapshot` and throws `UsageError` on hit. `loadedGroupIdSnapshots` in the produced pending state is always `undefined`.
- Function jsdoc updated to document the unsupported case.
- Unit tests for the removed path replaced with 5 tests for `snapshotHasLoadingGroups` (positive, deeply nested, ignored-when-unreferenced, top-level unreferenced).
- All 17 unit tests in `captureReferencedContents.spec.ts` pass; all 4 e2e tests in `captureFullContainerState.spec.ts` still pass.

When a host actually needs loading-group support, bring the path back together with a real e2e (datastore in non-default group → capture → rehydrate → verify reachable). Until then the assert keeps the surface honest.

#### E. GC end-to-end coverage — PARTIALLY RESOLVED

A new helper-level integration test landed: `captureReferencedContents.spec.ts` now has a case ("integrates with parseGcSnapshotData on a snapshot that carries a real gc subtree") that builds a snapshot whose `gc` subtree blobs encode unreferenced + tombstoned + deleted simultaneously, runs the real `parseGcSnapshotData` parser against it, then feeds the result into `captureReferencedAttachmentBlobs` and verifies only the live blob survives. This exercises the parser → filter integration end-to-end, where the previous tests hand-constructed `gcData`.

Still open: end-to-end coverage *through `captureFullContainerState` itself* (the function-level integration). Local-server has no summarizer, so this likely needs a unit-level test against a mocked `IDocumentServiceFactory`. Tracked in **Task 2** below.

#### F. Real-driver coverage

The integration suite uses only `LocalDocumentServiceFactory`. ODSP-specific behaviors (`getVersions`, snapshot caching contracts, version-id semantics) are unexercised. Consider whether at least one ODSP-driver test should exist before this graduates from `@alpha`. Tracked in **Task 3** below.

### Procedural — sign-offs flagged on the draft PR

The deep review listed required reviewers for graduation 5 → 7-8 → 9-10. Carrying them forward:

- **ChumpChief** — alpha-surface scaling: free function (`captureFullContainerState`) vs. overload of `asLegacyAlpha`. Reference: PR #25513 thread.
- **jatgarg** — telemetry / `configProvider` decision (PR #25394 enforcement on this file). Tied to item B above.
- **dannimad** — frozen-container API surface (co-author of PR #25653 which this output is designed to feed).

This branch is the **fourth API addition** on the `container-loader.legacy.alpha` surface, completing the series: PR #25513 (`asLegacyAlpha`), #25538, #25590, #25742, #25653 (`createFrozenDocumentServiceFactory`).

---

## Part 3 — Pre-push checklist

Things the branch needs before going out for review, distinct from the substantive feedback above:

- [ ] **Add a changeset.** None of the branch commits added a `.changeset/*.md`. Any new `@legacy @alpha` export needs one.
- [ ] **Regenerate the API report from source, not by hand.** The current uncommitted diff to `container-loader.legacy.alpha.api.md` is a parameter rename (`props` → `input`) that should come from `pnpm build:api-reports`, not a manual edit.
- [ ] **Trigger api-changes review** — adding a new export on a `@legacy @alpha` surface; the api-changes skill applies.
- [ ] **Decide on items A and B above** before posting for review — both are about the props/wire-format shape, which is the part that hardens once the PR is open.
- [ ] **Either document or fix the coverage gaps in D and E** — the deep review explicitly called out that the e2e suite doesn't exercise loading groups or GC end-to-end. If deferring, say so in the PR description.

---

## Part 4 — Follow-up tasks (ready to lift into ADO items)

Each section below is a self-contained work item: title + description + acceptance criteria, drafted to be pasted into an ADO work item without further editing.

### Task 1 — captureFullContainerState: harden binary attachment-blob encoding

**Title:** captureFullContainerState — fix lossy UTF-8 round-trip on attachment blobs

**Type:** Bug / Tech debt

**Description:**

`captureReferencedAttachmentBlobs` in `packages/loader/container-loader/src/captureReferencedContents.ts` currently encodes captured attachment blob bytes via `bufferToString(buffer, "utf8")`. Non-UTF-8 byte sequences (images, encrypted payloads, anything binary) are corrupted by this round-trip — substituted replacement characters cannot recover the original bytes.

The runtime's own pending-blob serializer uses base64 for exactly this reason. The `captureFullContainerState` capture path is what introduces the new wire-format obligation here; the existing `getBlobContentsFromTree` path in `containerStorageAdapter.ts` does not actually inline arbitrary attachment-blob bytes (it only saves the redirect table), so this is a new obligation, not a pre-existing limitation.

This was raised on draft PR #27100 and explicitly re-tiered in-scope by the deep review (readiness score 7 → 5 over this single item).

**Acceptance criteria:**

- Choose one of two paths and document which:
  1. **Base64 the bytes** at the new encode site in `captureReferencedAttachmentBlobs` and decode at the corresponding consume site in `serializedStateManager` / `containerStorageAdapter`. Likely requires a wire-format extension (e.g. a `binaryAttachmentBlobs` map alongside `snapshotBlobs`, or per-entry encoding flag) so the load path can distinguish encodings.
  2. **Document a UTF-8-only restriction** in the function's jsdoc and on `ICaptureFullContainerStateProps`, and explicitly throw `UsageError` if a non-UTF-8 attachment is encountered (or document that callers must guarantee UTF-8 attachments).
- Add a non-UTF-8 attachment-blob round-trip test in `packages/test/local-server-tests/src/test/captureFullContainerState.spec.ts`. Use a payload such as `Uint8Array([0xff, 0xfe, 0x00, 0x80, 0xc0])` and assert byte-exact equality between the captured blob handle's read and the original buffer after rehydration.
- If choosing path 1: ensure the wire format change does not break `loadFrozenContainerFromPendingState` callers that handle existing UTF-8 captures.

**Background links:**

- Draft PR #27100 deep-review thread, "Binary attachment blob bytes are corrupted by lossy UTF-8 round-trip during capture" finding.
- `packages/loader/container-loader/src/captureReferencedContents.ts:234`.

---

### Task 2 — captureFullContainerState: expand integration test coverage

**Title:** captureFullContainerState — fill in test coverage gaps

**Type:** Test debt

**Description:**

The `captureFullContainerState` integration suite at `packages/test/local-server-tests/src/test/captureFullContainerState.spec.ts` covers the attached + post-snapshot-ops + nested-DDS + pre-attach attachment-blob happy paths. Several scenarios are not yet covered, and the gap was called out on the prior draft PR.

**Acceptance criteria:**

Add integration tests (or unit-level tests of `captureFullContainerState` against a mocked `IDocumentServiceFactory` if integration is impractical) for each of:

- **Loading-group containers:** When the loading-group capture path lands (currently the function throws `UsageError` if `snapshotHasLoadingGroups` returns true), add an e2e that creates a datastore with a non-default `loadingGroupId`, captures, rehydrates via `loadFrozenContainerFromPendingState`, and verifies the group's data is reachable from the frozen container.
- **GC end-to-end through the function:** A test that exercises `captureFullContainerState` with a snapshot containing actual GC data (unreferenced subtree + tombstoned blob + deleted node) and verifies the captured pending state excludes the GC-filtered content. Local-server has no summarizer, so this likely requires a unit-level test with a mocked `IDocumentServiceFactory` returning a hand-crafted snapshot.
- **Multi-datastore container:** Two or more datastores beyond the default `TestFluidObject`, captured and rehydrated.
- **Reconnection / second-write after rehydration:** Frozen containers are read-only by design, but verify behavior when the captured pending state is fed into a *non-frozen* `loadExistingContainer` and additional ops are applied — does the merge with new ops behave correctly?
- **Post-attach attachment-blob upload:** Currently impossible in local-server (no summarizer), so requires either a mocked driver or an ODSP-driver test (see Task 3).

**Background links:**

- Draft PR #27100 deep-review thread, "Path to Ready" section.

---

### Task 3 — captureFullContainerState: add real-driver coverage (ODSP)

**Title:** captureFullContainerState — add ODSP-driver integration test coverage

**Type:** Test debt

**Description:**

The current `captureFullContainerState` integration suite uses only `LocalDocumentServiceFactory`. Several driver-side concerns are unexercised against a real driver:

- ODSP `getVersions` semantics (caching headers, version-id generation).
- ODSP `getSnapshot` vs. `getSnapshotTree` selection in the driver-only fetch path.
- ODSP snapshot caching contract — `cacheSnapshot: false` interaction.
- Real summarizer-produced snapshots (which carry GC trees, attachment-blob entries on `.blobs`, and the post-summary `.attributes` blob in the format the function reads).

Without driver-level coverage, regressions in any of those areas can ship undetected.

**Acceptance criteria:**

- Add an ODSP-driver e2e test for `captureFullContainerState`, modeled on existing ODSP tests in `packages/test/test-end-to-end-tests`. At minimum:
  1. Create + attach a container against ODSP (test tenant).
  2. Wait for at least one summary so the snapshot carries a GC tree and `.blobs` subtree with real entries.
  3. Run `captureFullContainerState` and verify the captured pending state is non-empty in the expected slots (`baseSnapshot`, `snapshotBlobs`, `savedOps`).
  4. Rehydrate via `loadFrozenContainerFromPendingState` and verify a known DDS value matches.
- Document, on the function's jsdoc or in `ICaptureFullContainerStateProps`, any driver-specific behavior the implementation now relies on (e.g. that some ODSP responses can omit `sequenceNumber` and the function falls back to the `.attributes` blob).
- Decide whether this test gates promotion of the `@legacy @alpha` API to `@legacy @beta` and record the decision in the PR description for the promotion change.

**Background links:**

- Draft PR #27100 deep-review thread, ODSP-driver coverage gap.
- Existing ODSP test scaffolding: `packages/test/test-end-to-end-tests/src/test/`.
