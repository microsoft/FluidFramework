# Product compatibility cleanup after the OCV update

Temporary working analysis and decision log. **Delete this file before opening a PR.**

## Context and scope

[PR #28691](https://github.com/microsoft/FluidFramework/pull/28691) raised the compatibility-test
Oldest Compatible Version (OCV) to exact `2.0.9` and removed obsolete test infrastructure.
This follow-up audits product-code adapters for older in-memory layer APIs.

The test-floor change does not itself change production compatibility guarantees, public/legacy API
contracts, supported third-party implementations, checkpoint policy, or persisted-document support.
Each removal needs evidence that its purpose is limited to versions outside the supported layer set.

**Execution constraint:** Do not introduce breaking changes to behavior reachable through legacy/beta
APIs in this effort, including already-deprecated APIs. Keep those paths intact and classify otherwise
removable compatibility code in the two deferred lists below. Assess behavioral reachability as well as
exported type signatures; a private implementation method can still implement an exported option.

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

**Status:** Deferred by agreement: behavior reachable through deprecated legacy/beta APIs. No product changes.

- `packages/runtime/container-runtime/src/containerRuntime.ts`:
  private `request()` method, including summarizer routing, and the `requestHandler` load option.
- Removal comments explicitly refer to pre-entry-point loaders and internal.7.

**Potential change:** Remove obsolete loader-facing entry-point routing and unused associated state.
Audit application/framework callers and release-tag commitments. Keep `resolveHandle` and handlers
that still participate in handle resolution; not every request handler is an old-loader shim.

**Audit findings:**

- Actual installed `2.0.9` Container has `getEntryPoint()` and no `request()` method.
  Current loader sources contain no runtime `.request()` calls.
- ContainerRuntime's private `request()` handles the special summarizer route and otherwise invokes
  its stored `requestHandler`. `resolveHandle()` is separate and does not invoke that handler.
- `LoadContainerRuntimeParams.requestHandler` is exported as `@legacy @beta` and appears in legacy
  API reports. Aqueduct's exported `BaseContainerRuntimeFactoryProps.requestHandlers` also feeds it.
- `containerRuntime.spec.ts` explicitly tests invoking the private method through an `any` cast and
  receiving the configured response. This is not a loader-driven scenario, but documents existing behavior.
- Removing the private method alone would leave exported handler configuration accepted but ineffective.
  Removing the configuration too would change exported legacy APIs. Neither follows automatically from OCV.
- The repository's Beta Break Process requires partner-usage/deprecation review and designated breaking
  releases for legacy+beta removals. The current build is `3.13.0`, outside a designated ten-minor boundary.
- Existing test factories still pass handlers for versioned runtime construction. Those adapters must be
  considered separately from current product API removal; supported older runtimes retain their own behavior.

**Decision:** Retain routing and configuration as a unit. Track future removal in deferred list 1;
do not remove the private method while silently accepting an ineffective exported handler option.
Keep handle resolution independently of any future request-routing removal.

**Validation:** Read-only caller/contract audit and installed-boundary prototype check; no new tests needed yet.

### 3. Loader batch-submission fallbacks

**Status:** Cleanup approved and complete. Inbound-only splitter behavior retained.

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

**Contract audit:** `IContainerContext` is non-deprecated `@legacy @beta`, but `submitBatchFn` is already
required. Installed `2.0.9` ContainerContext accepts and stores that callback. The removed fallback
supports contexts missing a required method, not an alternative permitted by the current contract.
The deprecated `submitFn` API itself and its loader implementation remain unchanged (summary submission
still has a separate fallback; category 4). `makeLegacySendBatchFn`, Outbox, and OpSplitter are not
exported from the package entry point. No legacy/beta signatures or conforming behavior change.

**Decision / changes:** Require `submitBatchFn` in internal Outbox parameters; remove legacy batch send,
the callback factory/runtime wiring, and the missing-callback compression bypass. Remove the obsolete
legacy-context Outbox test and migrate existing runtime test mocks to batch submission, preserving
their operation counts, metadata, rollback, and sequence-number assertions.

**Retained:** OpSplitter accepts an absent callback for inbound-only processing, used by current message
reader tests. Its chunking guard and send-time assertion remain; comments now explain this purpose.
Do not delete historical chunk/compression readers or their tests. No entries added to deferred API lists:
the callback omission is not part of the current non-deprecated legacy/beta contract.

**Validation:**

- Runtime build passed (ESM/CJS, type tests, lint/format, dependency checks, API reports, docs model).
  No API report changes. E2E build passed.
- Explicit current runtime/op-lifecycle suites: 276 passing, including Outbox, OpSplitter,
  RemoteMessageProcessor, OpDecompressor, and ContainerRuntime.
- The initial selection order exposed an existing circular-import initialization issue; loading
  containerRuntime.spec first avoids it. Initial behavior failures identified missing required callbacks
  in test mocks, fixed as described above.
- Local OCV compression/detached scenarios: 42 passing, 2 pending.
- Targeted local N-1/cross-client compression/schema scenarios: 224 passing.
- No live real-service validation performed for this category.

### 4. Loader summary-submission fallbacks

**Status:** Runtime cleanup approved and complete. Loader-side legacy routing deferred.

- `packages/runtime/container-runtime/src/containerRuntime.ts`:
  `submitSummaryFn ?? ((summaryOp, refseq) => submitFn(...))`.
- `packages/loader/container-loader/src/container.ts`:
  generic submission path routes summaries to dedicated summary submission.
- Comments reference ADO #1385.

**Evidence:** The installed `2.0.9` loader context supplies `submitSummaryFn`.

**Potential change:** Use dedicated summary submission and remove the paired generic-submission adapter,
subject to caller and API-contract audit. Preserve reference-sequence-number handling and summary validation.

**Contract audit / decision:** `IContainerContext.submitSummaryFn` is already required by its
non-deprecated `@legacy @beta` contract and supplied by installed `2.0.9` ContainerContext. Remove
the runtime fallback for contexts missing that required method. The deprecated `submitFn` method
itself remains callable by custom runtimes: keep the loader's `MessageType.Summarize` routing and
record it in deferred list 1. No current exported signatures or conforming behavior change.

**Changes:** Assign the dedicated callback directly, remove the runtime's unused `submitFn`
destructuring, and migrate the runtime test mock's summary callback. Continue forwarding the summary
reference sequence number at submission. Do not remove or alter loader summary validation/routing.

**Validation:** Runtime build passed, including ESM/CJS, type tests, lint/format, dependency checks,
API reports, and documentation model; no report changes. Runtime/summary-manager suites: 228 passing.
E2E build passed. Local OCV summary selection: 70 passing, 8 pending; targeted N-1/cross-client
incremental summaries: 32 passing; current summary/summarizer selection: 24 passing.
No live real-service validation performed for this category.

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

Category 1 cleanup is approved and complete. Category 2 is deferred to preserve deprecated legacy/beta
API behavior. Category 3 cleanup is approved and complete. Category 4 runtime cleanup is approved and complete,
with loader-side routing deferred. Categories 5–11 remain pending decision.
Retained/deferred categories should include the reason and any follow-up evidence needed.

## Deferred list 1: reachable through already-deprecated legacy/beta APIs

These are candidates for a separately approved API-removal effort, not this cleanup.

| Category / candidate | API preserving reachability | Deprecation evidence | Future action |
| --- | --- | --- | --- |
| 2. Old loader-to-runtime request routing: ContainerRuntime's private `request()`, stored handler, and associated plumbing | `LoadContainerRuntimeParams.requestHandler` (`@legacy @beta`); Aqueduct `BaseContainerRuntimeFactoryProps.requestHandlers` (`@legacy @beta`) | Both properties have existing `@deprecated` notices tied to entry-point migration | Review partner usage and follow the legacy/beta breaking-change process; remove routing and configuration together. Preserve `resolveHandle` and any independently needed handle-resolution handlers. |
| 4. Loader generic-submit summary routing: `submitContainerMessage` handling of `MessageType.Summarize` | `IContainerContext.submitFn` (`@legacy @beta`) | Method has `@deprecated` directing callers to `submitBatchFn` and `submitSummaryFn` | Preserve generic submission behavior until the deprecated API is separately approved for removal. The runtime's missing-`submitSummaryFn` fallback can be removed independently. |

## Deferred list 2: reachable through non-deprecated legacy/beta APIs

No candidates established yet. This does not mean the remaining categories are safe to remove; audit
each category for exported contracts, observable behavior, and custom implementation support first.

When adding an entry, identify the compatibility path, the API that makes it reachable, evidence that
the API is not deprecated, and the prerequisite for a separate deprecation/removal effort. If a candidate
is reachable through both deprecated and non-deprecated APIs, record those paths explicitly and track
the candidate in this list as well; do not treat a deprecated route as the only constraint.
