# Product compatibility cleanup after the OCV update

Temporary working analysis and decision log. **Delete this file before opening a PR.**

## Context and scope

[PR #28691](https://github.com/microsoft/FluidFramework/pull/28691) raised the compatibility-test
Oldest Compatible Version (OCV) to exact `2.0.9` and removed obsolete test infrastructure.
This follow-up audits product-code adapters for older in-memory layer APIs.

The test-floor change does not itself change production compatibility guarantees, public/legacy API
contracts, supported third-party implementations, checkpoint policy, or persisted-document support.
Each removal needs evidence that its purpose is limited to versions outside the supported layer set.

Initial inspection was against `92230cb4b32`. Source paths below are navigation pointers; line numbers
and comments can change. Candidate status is not approval to remove code.

## Execution plan

Work through the categories below **one at a time**:

1. Inspect the implementation, interfaces, callers, and associated tests/work items.
2. Verify the relevant API and behavior in actual `2.0.9` packages and supported later versions.
3. Decide whether to remove, retain, or defer the adapter. Record the evidence and decision here.
4. Implement only the agreed cleanup, including necessary caller and test updates.
5. Run focused behavioral tests, supported compatibility scenarios, builds, lint/format checks, and
   API extraction/report generation where affected. Avoid adding tests that only mirror the implementation.
6. Leave changes unstaged for review. Commit only when requested, keeping categories independently reviewable.
7. Proceed to the next category after the current category's decision and cleanup are reviewed.

Before a PR, review the combined scope, remove this tracking file, and summarize decisions and validation.
Do not push without explicit permission; upstream push permissions granted for the preceding work were one-time.

## Categories and initial findings

### 1. Entry-point existence checks

**Status:** Cleanup approved and complete.

- `packages/loader/container-loader/src/container.ts`, `Container.getEntryPoint`:
  both immediate and runtime-instantiated paths call `this._runtime.getEntryPoint?.()`.
- `packages/runtime/container-runtime/src/summary/summaryHelpers.ts`, `formCreateSummarizerFn`:
  checks for `resolvedContainer.getEntryPoint` and otherwise calls `.request()`.
- `packages/loader/container-loader/src/createAndLoadContainerUtils.ts`:
  an additional explicit check for missing `container.getEntryPoint` warrants inspection.

**Evidence:** The installed `2.0.9` ContainerRuntime implements `getEntryPoint`; the `2.0.9` loader
implements container entry points. Current `IRuntime` and `IContainer` require the method.

**Potential change:** Use direct calls and remove the old summarizer request fallback. Preserve checks
for disposal, runtime instantiation, invalid entry-point contents, and summarizer validation.
Check custom runtime/loader contracts before assuming every existence check is historical.

**Decision:** Remove all three method-existence guards. Current `IRuntime` and `IContainer` contracts
require `getEntryPoint()`, including for custom implementations. Verified actual `2.0.9` loader
Container and ContainerRuntime prototypes both implement it. The on-demand summary helper loads
the current concrete Container, so its existence check is also redundant.

**Changes:** Call runtime entry points directly in both Container paths, remove the old summarizer
`.request()` fallback and unused imports, and remove the on-demand summary method-existence check.
Preserve disposal/instantiation handling, invalid-result checks, ISummarizer validation, and request headers.
No exported signatures change. Runtime request-routing removal remains category 2.

**Validation:**

- Actual installed `2.0.9` prototypes: Container and ContainerRuntime both provide `getEntryPoint`.
- `fluid-build --task build /container-loader$ /container-runtime$` passed, including ESM/CJS compilation,
  type tests, lint/format, dependency checks, API reports, and documentation models. No API report changes.
- Loader unit suite: 347 passing, including existing on-demand-summary lifecycle/failure tests.
- Runtime `containerRuntime.spec.js` and `summary/summaryManager.spec.js`: 228 passing.
  Initial default-glob discovery hit stale compiled tests importing removed OrderedClientCollection;
  explicit current test-file selection avoided those unrelated build artifacts.
- E2E build passed. Local OCV summarization selection: 70 passing, 8 pending.
- Targeted local N-1/cross-client incremental-summary selection: 32 passing.
- No live real-service validation performed for this category.

### 2. Old loader-to-runtime request routing

**Status:** Pending decision. Strong candidate, with caller/API audit required.

- `packages/runtime/container-runtime/src/containerRuntime.ts`:
  private `request()` method, including summarizer routing, and the `requestHandler` load option.
- Removal comments explicitly refer to pre-entry-point loaders and internal.7.

**Potential change:** Remove obsolete loader-facing entry-point routing and unused associated state.
Audit application/framework callers and release-tag commitments. Keep `resolveHandle` and handlers
that still participate in handle resolution; not every request handler is an old-loader shim.

**Decision / changes / validation:** Not yet recorded.

### 3. Loader batch-submission fallbacks

**Status:** Pending decision. Strong candidate.

- `packages/runtime/container-runtime/src/opLifecycle/outbox.ts`, `sendBatch`:
  branches on missing `submitBatchFn` and invokes `legacySendBatchFn`.
- `packages/runtime/container-runtime/src/containerRuntime.ts`:
  constructs and supplies `makeLegacySendBatchFn` to Outbox.
- `packages/runtime/container-runtime/src/opLifecycle/opSplitter.ts`:
  checks batch-submission availability when enabling chunking.

**Evidence:** The installed `2.0.9` loader context supplies `submitBatchFn`; current context types require it.

**Potential change:** Require supported batch submission and remove legacy outbound submission adapters
and obsolete capability checks. Validate compression, grouping, chunking, resubmission, and sequence numbers.
This is an outbound API cleanup, not permission to remove historical batch readers.

**Decision / changes / validation:** Not yet recorded.

### 4. Loader summary-submission fallbacks

**Status:** Pending decision. Strong candidate.

- `packages/runtime/container-runtime/src/containerRuntime.ts`:
  `submitSummaryFn ?? ((summaryOp, refseq) => submitFn(...))`.
- `packages/loader/container-loader/src/container.ts`:
  generic submission path routes summaries to dedicated summary submission.
- Comments reference ADO #1385.

**Evidence:** The installed `2.0.9` loader context supplies `submitSummaryFn`.

**Potential change:** Use dedicated summary submission and remove the paired generic-submission adapter,
subject to caller and API-contract audit. Preserve reference-sequence-number handling and summary validation.

**Decision / changes / validation:** Not yet recorded.

### 5. Audience API polyfills

**Status:** Pending decision. Strong candidate.

- `packages/runtime/container-runtime/src/containerRuntime.ts`:
  synthesizes `audience.getSelf` and emits `selfChanged` if `getSelf` is missing.
- The comment identifies the API as added in RC3.

**Evidence:** The installed `2.0.9` loader audience implements `getSelf`.

**Potential change:** Remove the pre-RC3 polyfill after verifying supported audience contracts.
Validate connection, reconnection, client-ID changes, and event ordering.

**Decision / changes / validation:** Not yet recorded.

### 6. Ancient event-signature guards

**Status:** Pending decision. Strong candidate.

- `packages/runtime/container-runtime/src/connectionTelemetry.ts`:
  inbound `idle` handler checks `typeof count === "number"`; comment identifies pre-0.36 loaders
  without count/duration arguments.

**Potential change:** Remove historical argument-presence guards after verifying event signatures.
Keep thresholds and other real telemetry conditions, such as `count >= 100`.

**Decision / changes / validation:** Not yet recorded.

### 7. Dispose versus close adapters

**Status:** Pending decision. Additional proof required.

- `packages/runtime/container-runtime/src/containerRuntime.ts`: `disposeFn ?? closeFn`.

**Evidence:** The installed `2.0.9` loader provides `disposeFn`, but the current context interface still
marks it optional. That optionality may accommodate custom implementations rather than only old Fluid loaders.

**Potential change:** Require disposal only if the supported contract permits it. Preserve the semantic
distinction between disposal and close/readonly behavior, including error propagation.

**Decision / changes / validation:** Not yet recorded.

### 8. Datastore attachment-event bridges

**Status:** Pending decision. Additional proof required.

- `packages/runtime/datastore/src/dataStoreRuntime.ts`, `attachListener`:
  subscribes through `(this.dataStoreContext as any).once?.(...)` to `attaching` and `attached`.
- Comments identify RC2-era compatibility.
- `setAttachState` also calls `attachGraph` with an ancient visibility-compatibility comment.

**Evidence:** The installed `2.0.9` datastore runtime implements `setAttachState`.
Still verify that supported container runtimes consistently invoke the newer attachment API.

**Potential change:** Remove duplicate event bridges and, only with separate proof, obsolete attachment
ordering accommodations. Validate detached creation, attachment, graph visibility, and event ordering.

**Decision / changes / validation:** Not yet recorded.

### 9. Document-unique-ID fallbacks

**Status:** Pending decision. Additional proof required.

- `packages/runtime/datastore/src/dataStoreRuntime.ts`, `createChannel`:
  `containerRuntime.generateDocumentUniqueId?.() ?? uuid()`.

**Evidence:** The installed `2.0.9` ContainerRuntime implements `generateDocumentUniqueId`.

**Potential change:** Make the API call unconditional if supported context implementations guarantee it.
Preserve the explicit DisableShortIds feature flag, numeric-versus-string results, and ID namespace rules.

**Decision / changes / validation:** Not yet recorded.

### 10. Ancient detached-storage behavior

**Status:** Pending decision. Additional proof required.

- `packages/loader/container-loader/src/containerStorageAdapter.ts`, `policies` getter:
  catches storage access failures, with a comment about a 0.40 runtime requesting policies while detached.

**Potential change:** Remove the catch only if it no longer handles legitimate current detached-state access.
Do not infer that the storage policy itself is always present just because the old runtime is unsupported.

**Decision / changes / validation:** Not yet recorded.

### 11. Extra scheduling hooks for old loaders

**Status:** Pending decision. Additional proof required; correctness-sensitive.

- `packages/runtime/container-runtime/src/containerRuntime.ts`:
  `deltaManager.on("op", () => this.flush())`, justified by old loaders not passing non-runtime messages
  to ContainerRuntime processing.

**Potential change:** Remove the redundant listener only after establishing the contract at `2.0.9`.
Validate reference-sequence-number changes, runtime/non-runtime op ordering, batching, and resubmission.

**Decision / changes / validation:** Not yet recorded.

## Compatibility that remains necessary

These are not cleanup targets merely because OCV advanced:

- **Persisted historical ops and summaries.** Keep legacy chunk reassembly, historical compressed-batch
  formats, missing-compression-metadata recognition, old summary layouts, and GC metadata readers.
  Old messages can appear as trailing ops even without old live collaborators.
  In particular, `opLifecycle/opDecompressor.ts` has an internal.1/internal.2 self-healing comment, but
  the inspected code reads message data; its removal is not justified by the live-client floor.
- **Offline/stashed historical state.** Format adapters in pending-state loading may have independent
  longevity requirements; audit separately from current in-memory API calls.
- **Post-OCV APIs.** Optional `fetchOps` handling explicitly supports later loader differences (AB#81034).
  Other examples include signal-audience, blob-aware dirty state, and newer snapshot APIs.
- **Later lifecycle/connection APIs.** The loader's `setConnectionStatus` versus `setConnectionState`
  handling supports an API transition whose introduction must be checked separately.
- **Supported API signature differences.** Keep `loadRuntime` registry API-version handling and older
  compatibility-setting property names where supported packages require them.
- **Handle resolution and application routing.** Do not remove all `request`/`resolveHandle` paths as a
  consequence of removing pre-entry-point container routing.
- **Public/legacy contracts and custom implementations.** Required/optional typing changes and exported
  API removal need their own compatibility analysis and repository release/change documentation where required.
- **Layer compatibility validation without newer metadata.** Older supported packages may predate the
  metadata itself; absence does not prove that the package is below OCV.

## Working decision summary

Category 1 cleanup is approved and complete. Categories 2–11 remain pending decision.
Retained/deferred categories should include the reason and any follow-up evidence needed.
