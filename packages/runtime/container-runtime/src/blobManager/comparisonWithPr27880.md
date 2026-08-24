# Comparison with PR #27880

This document compares:

- [PR #28054](https://github.com/microsoft/FluidFramework/pull/28054), whose feature code is at
  `b59ae8f388` and whose reviewed documentation head was `db4b673d96`, against merge base
  `4374770404`;
- [PR #27880](https://github.com/microsoft/FluidFramework/pull/27880) at `e7d4c5d0e0`
  against merge base `45b18c360a`.

The PRs have different merge bases: #27880's base `45b18c360a` is an ancestor of #28054's base
`4374770404` by 83 commits. Their branches also identify themselves as package versions 2.116.0
and 3.0.0 respectively. The comparison therefore distinguishes PR changes from behavior inherited
through base divergence and compares each resulting design rather than directly diffing the heads.

## Result

#28054 is the stronger correctness base:

- it stores real binary summary blobs rather than permanent base64 text;
- it preserves attached pending state and full-state artifacts more completely;
- it activates the writer format only for detached documents;
- it has stronger sweep cleanup and loader/runtime compatibility handling.

#27880 has broader portable E2E, stress, and service-load coverage and keeps the option internal.
Those are useful ideas to adopt.

The strongest remaining shared correctness risk is not whether payload bytes are returned eagerly:
it is whether a service always retains the grouped subtree and its blob IDs in the snapshot tree. If
that subtree were omitted entirely, neither implementation has an out-of-group manifest from which
to detect the loss before the next summary drops the entries. This service contract is expected but
still needs an ODSP network test and runtime defense in depth.

Both PRs assign a loading-group ID to one shared summary subtree. Whether later ODSP network
snapshots omit that group's payloads still needs end-to-end validation, and the loader uses the
loading-group-aware snapshot API only when both its feature gate and driver policy are enabled.

ODSP create-cache snapshots intentionally contain every submitted summary blob under a synthetic
UUID. That is a valid self-contained cache representation: the synthetic IDs remain usable because
their bytes are present, and neither implementation exposes them as attachment IDs. It is an
efficiency tradeoff only if the product requirement says that cache-backed loads must also omit
payloads.

## Shared summary architecture

Both implementations:

- keep detached-created bytes in BlobManager and leave `IDetachedBlobStorage` empty;
- use the loader's existing no-outstanding-blobs attach path for one logical create request;
- persist one grouped subtree keyed by stable BlobManager `localId`;
- retain `localId -> currentSnapshotBlobId` on attached load without exposing that snapshot ID as an
  attachment ID;
- keep application and GC identity at `/_blobs/<localId>`;
- lazily read an individual snapshot blob through `readBlob()`;
- emit stable `SummaryType.Handle` entries from fresh clean ordinary summarizers;
- materialize surviving payloads for full-tree summaries with at most 32 reads in flight;
- gate the persisted schema property through document-schema compatibility.

Full-state capture, pending-state behavior, writer activation, sweep cleanup, and service coverage
are not shared and are compared below.

## Verified differences

| Area | Current #28054 | #27880 |
|---|---|---|
| Runtime option | `enableSingleRoundTripFileCreate`, exposed on legacy `ContainerRuntimeOptions` as `@beta` while also documented as experimental/not ready. | `inlineDetachedBlobsAsSummaryBlobs` exists only on `ContainerRuntimeOptionsInternal`; no customer API report change. |
| Persisted schema property | `enableSingleRoundTripFileCreate`. | `inlineDetachedBlobsAsSummaryBlobs`. |
| Summary subtree | `.blobs/.embeddedDetachedBlobs`, group ID `fluid-internal:embedded-detached-blobs`. | `.blobs/.detached`, group ID `fluid-internal:detached-blobs`. |
| Persisted payload | Raw binary `SummaryType.Blob`. The driver owns any base64 wire representation and `readBlob()` returns original bytes. | Base64 UTF-8 `SummaryType.Blob`. BlobManager permanently pays the approximately 4/3 storage/read expansion and performs encode/decode. |
| Ordinary summary | A fresh clean summarizer emits stable path handles and does not reupload unchanged image bytes. | Same mechanism. |
| Full-tree summary | Reads missing raw bytes and emits binary content. | Reads missing payloads, decodes them, then emits new base64 text. |
| Compatibility floor | Requires an explicitly supplied `oldestSupportedClient >= 3.0.0` or its deprecated `minVersionForCollab` alias; rejects the default sentinel. | Declares `2.115.0`, but the reader is absent from the `client_v2.115.0` and `client_v2.116.0` release tags. The floor must move to the first release that contains the implementation. |
| Loader/runtime pairing | Under normal layer-compatibility enforcement, requires loader capability `binarySnapshotBlobSerialization` whenever the persisted format is active. The feature requirement is appended to baseline Loader requirements. `allowIncompatibleLayers`, or disabling strict checks when the Loader supplies no compatibility details, can suppress this protection and need an explicit corruption-risk rollout contract. | No binary capability is needed for detached serialization because the persisted payload is UTF-8 base64 text. This does not solve fresh attached pending-state omission or give an old Loader full-state support for the loading group. |
| Writer activation | Requests the feature property only while detached and preserves a persisted detached selection across rehydrate. Enabling the option globally does not request that property for an unrelated attached document, although the host's explicitly supplied compatibility floor can still advance `info.minVersionForCollab`. | Passes the configured option into schema selection for attached existing documents too, potentially persisting the feature property without enabling a useful detached-create workflow. |
| Rehydrate with option omitted | Existing persisted selection remains active, so blobs added after detached rehydrate continue using the summary-backed format. The implementation needs a direct option-omitted integration test. | Existing summary-backed blobs remain readable, but newly added detached blobs revert to legacy detached storage when the host omits the option. |
| Detached serialized state | Loader partitions structural bytes between lossless UTF-8 `snapshotBlobs` and base64 `snapshotBlobContents`, then reconstructs binary `ISnapshot` contents. | Persisted base64 text survives the legacy UTF-8 structural map. |
| Fresh attached pending state | Fetches structural child blobs omitted from the snapshot with at most 32 reads in flight and serializes arbitrary bytes safely. This makes state self-contained but eagerly materializes all summary-backed payloads, increasing latency and JSON size. | The live pending-state `.blobs` special case saves `.redirectTable` but not omitted `.detached` child payloads, so ordinary online recovery can read from service but an offline artifact is incomplete. |
| Full-state capture | Retains snapshot-resident unreferenced-but-unswept content because saved ops may revive it. The branch also contains newer DeltaManager catch-up infrastructure. | Filters snapshot-time unreferenced content. The absence of newer DeltaManager catch-up is base divergence, not a regression introduced by #27880, and is resolved by rebasing. |
| GC and sweep | Removes classification, redirect mapping, creator cache, and the later summary entry; creator and attached-loaded cases are tested separately. | Removes classification and redirect/summary state but leaves the creator's `localBlobCache`, so memory and `hasBlob()` can survive sweep. |
| Loader knowledge | Larger generic loader/state-format change plus a runtime-loader capability contract. Blob-format-specific names and base64 decoding remain in BlobManager. | Smaller loader diff and no binary handshake, but loader full-state capture still contains more GC/path filtering assumptions and BlobManager owns permanent base64. |
| Focused integration | Local-server request counts, binary rehydrate plus another blob, creator pending state, frozen capture, clean-summary handles, and a later full-tree summarizer loaded from the ordinary summary. | Local-server request counts, binary rehydrate, fallback, and frozen capture. |
| Broader validation | No feature-specific portable service E2E, randomized stress, or service-load matrix. | Adds portable E2E, detached stress, and service-load option-matrix plumbing. These improve breadth but do not prove ODSP payload exclusion. |
| Mutual readability | The two formats use different schema properties, subtree names, group IDs, and payload encodings. No migration reader exists in either PR. | Same. |

## Snapshot acquisition behavior and open validation

Summary handles prevent reuploading unchanged payloads in ordinary summaries. That is separate from
whether a later loader downloads the payloads.

The loader uses the `ISnapshot` path that can preserve loading-group omission only when:

```text
Fluid.Container.UseLoadingGroupIdForSnapshotFetch2 === true
and
storage policies support getSnapshot()
```

Otherwise it falls back to the legacy snapshot-tree path, which has no equivalent code-level
payload-exclusion guarantee.

ODSP create-cache behavior is different from the service snapshot path:

1. `convertCreateNewSummaryTreeToTreeAndBlobs()` recursively converts every summary blob to a
   synthetic UUID and puts every payload in `ISnapshot.blobContents`.
2. `createFile()` stores that complete snapshot in the create cache.
3. `OdspDocumentStorageService` can return the cached snapshot unchanged to a later load.

Consequently, a cache-backed load receives all embedded payloads. This is correct because the cache
is self-contained, and the synthetic IDs are only local snapshot lookup details. If cache-backed
loads must also be payload-lazy, the implementation would need to bypass/refresh this cache, obtain
service-assigned IDs, or provide another lazy-read mapping. Removing the bytes alone would be
incorrect because the service cannot resolve the synthetic IDs.

The network path still needs an ODSP test that inspects the returned `ISnapshot.blobContents` and
proves that the grouped subtree structure and service blob IDs are present while image bytes are
absent.

## Summary actors and intentional materialization

Both designs rely on a separate clean summarizer created by `formCreateSummarizerFn()` in
`summary/summaryHelpers.ts`. That actor loads from storage, has no creator cache, and emits stable
handles in ordinary storage summaries.

Materialization is intentional for:

- the initial attach summary;
- a direct summary from the still-live creator;
- a full-tree summary, which cannot use prior-summary handles;
- a self-contained pending or full-state artifact.

The last case is a product decision as well as a correctness mechanism. #28054 currently chooses
self-contained attached pending state and therefore fetches every omitted summary-backed payload.
If pending state should support a reference-only mode, that contract must be explicit rather than
silently dropping bytes.

## What to adopt from #27880

- Portable service E2E coverage.
- Randomized detached-blob stress coverage.
- Service-load option-matrix plumbing.
- Internal or alpha staging while service behavior and operational limits remain unresolved.

Do not adopt:

- permanent base64 persistence;
- the `2.115.0` compatibility floor;
- schema activation for unrelated attached documents;
- snapshot-time GC filtering in full-state capture;
- creator-cache retention after sweep.

## Prioritized remaining work for #28054

### P1: storage contract, rollout, and workflow completeness

1. Verify the ODSP network path always returns the loading-group structure and service blob IDs,
   while omitting payload bytes when supported. Add an out-of-group manifest or equivalent
   validation so an unexpectedly absent/empty group cannot be silently dropped by the next
   summary. A bare assertion that the subtree must always exist is insufficient because a
   feature-enabled document may legitimately contain zero embedded blobs.
2. Decide whether cache-backed loads are allowed to remain self-contained and eager. Only if they
   must also be payload-lazy is a create-cache redesign required.
3. Add telemetry that identifies cache versus network source, snapshot API used, grouped payload
   count/bytes returned, and fallback behavior.
4. Adopt #27880's portable E2E, stress, and service-load coverage while asserting #28054's raw
   binary format and clean-summary handles.
5. Test detached rehydrate with the host option omitted, then create another blob and verify zero
   detached-storage uploads.
6. Add feature-specific `AttachState.Attaching`, create failure/retry/idempotency, and
   unreferenced-content revival tests.
7. Define attached pending-state semantics and cost. The current self-contained path uses bounded
   materialization; decide whether to retain it, add an explicit reference-only mode, or impose
   documented limits.
8. Add concrete old-runtime/new-runtime and old-loader/new-loader pairing tests. Decide whether
   compatibility-bypass settings are unsupported or whether the binary capability requirement must
   be non-bypassable.
9. Resolve the public API staging mismatch. If the option remains public, expose its mandatory
   `oldestSupportedClient` companion through common factory props such as
   `ContainerRuntimeFactoryWithDefaultDataStoreProps`; otherwise keep it internal or alpha.
10. Ensure the `ISnapshot` structural-capture fast path excludes direct root `.blobs` attachment
   contents even when a driver supplies them in `blobContents`.

### P2: operationalization

1. Define blob-count, binary summary size, JSON pending-state size, and request-size limits with an
   early fallback or actionable failure.
2. Add create retry, lazy-read, pending-state, full-tree, and full-state materialization telemetry.
3. Validate efficiency and fallback behavior on non-ODSP services.
4. Version or explicitly document the forward-only contract for serialized state containing
   `snapshotBlobContents`.

API-report regeneration in the available environment deterministically retains an unrelated
`events_pkg` import in the legacy reports. Because the reports are generated artifacts and the
feature's intended optional beta member is represented correctly, and the non-local
`ci:build:api-reports` validation passes with these reports, this is recorded as tooling drift
rather than hand-edited. Regenerating the merge-base reports with the same toolchain produces the
same import, confirming that it is not caused by this feature.

## Principle verdict

| Principle | #28054 | #27880 |
|---|---|---|
| Single logical create request | Meets | Meets |
| Ordinary summaries avoid payload reupload | Meets | Meets |
| Future network snapshots exclude payloads | Unverified; depends on the loading-group-aware snapshot path | Same |
| Cache-backed snapshot loads | Correct but eager because the self-contained create cache includes payloads under synthetic IDs | Same |
| Raw-binary persistence without permanent base64 expansion | Meets | Does not: preserves bytes by persisting base64 text |
| GC/sweep | Meets in covered creator and loaded states | Creator cache cleanup gap |
| Full-state correctness | Stronger revivable-content retention; also benefits from newer base catch-up infrastructure | Revivable-content gap; catch-up difference is resolved by rebasing |
| Minimum special knowledge | Broader generic loader support plus capability handshake | Smaller loader change but permanent format logic/overhead in BlobManager |
| Safe rollout | Stronger detached-only selection and explicit floor; bypass/API staging work remains | Invalid floor and unrelated attached-document activation |
| Long-term pending/full-state behavior | Correct but potentially expensive; grouped-subtree presence still needs defense in depth | Fresh attached pending and full-state correctness gaps; same grouped-subtree risk |
| Test breadth | Strong focused workflow assertions | Better portable/stress/service breadth |

## Historical note

#28054 originally proposed graduating snapshot summary blob IDs into attachments after load. That
approach was rejected because detached state and ODSP create-cache snapshots can contain
client-synthetic IDs. Both current designs instead keep stable BlobManager local IDs and permanent
summary backing. Synthetic snapshot IDs are valid as cache-local lookup details while their bytes
remain present; they must not be treated as service attachment IDs.
