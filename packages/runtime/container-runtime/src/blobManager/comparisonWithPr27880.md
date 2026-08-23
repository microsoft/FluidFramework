# Comparison with PR #27880

[PR #28054](https://github.com/microsoft/FluidFramework/pull/28054) and
[PR #27880](https://github.com/microsoft/FluidFramework/pull/27880) now use the same core identity
architecture: detached-created blobs stay permanently summary-backed. They differ materially in
where base64 encoding is owned.

## Shared architecture

Both implementations:

- keep detached-created bytes in BlobManager and leave `IDetachedBlobStorage` empty;
- use the loader's existing no-outstanding-blobs attach path for one logical create;
- persist one shared grouped subtree keyed by stable BlobManager `localId`;
- retain `localId -> currentSnapshotBlobId` on attached load without treating that ID as an
  attachment ID;
- lazily read one snapshot blob at a time;
- emit stable `SummaryType.Handle` entries from clean ordinary summarizers;
- materialize payloads for full-tree summaries with concurrency 32;
- preserve detached serialization/rehydrate and GC/sweep behavior;
- use generic `captureFullContainerState()` support for structural child blobs below root `.blobs`,
  separately from attachment payload capture;
- gate the persisted `true` schema value with document-schema compatibility.

The relevant code is `BlobManager` in `blobManager.ts`, `loadV1()` and
`summarizeBlobManagerState()` in `blobManagerSnapSum.ts`,
`runtimeOptionsAffectingDocSchemaConfigValidationMap` in `containerCompatibility.ts`, and
`readReferencedSnapshotBlobs()` / `snapshotHasLoadingGroups()` in
`packages/loader/container-loader/src/captureReferencedContents.ts`.

## Verified differences

| Area | Current #28054 | #27880 |
|---|---|---|
| Runtime option | `enableSingleRoundTripFileCreate`, marked `@beta` on the legacy `ContainerRuntimeOptions` interface. | `inlineDetachedBlobsAsSummaryBlobs` on `ContainerRuntimeOptionsInternal`; it does not add a public option member. |
| Persisted schema property | `enableSingleRoundTripFileCreate`. | `inlineDetachedBlobsAsSummaryBlobs`. |
| Summary subtree | `.blobs/.embeddedDetachedBlobs`, group ID `embeddedDetachedBlobs`. | `.blobs/.detached`, group ID `fluid-internal:detached-blobs`. |
| Persisted payload | Raw binary `SummaryType.Blob`. The driver owns any base64 wire encoding and `readBlob()` returns the original bytes. | Base64 UTF-8 `SummaryType.Blob`. Storage returns the base64 text bytes and BlobManager decodes them. |
| Compatibility floor | `3.0.0`, the first release line containing this binary reader and serialized-state support. | `2.115.0` in the PR branch. |
| Serialized-state handling | Loader retains lossless UTF-8 structural blobs in the legacy map and generically encodes all other bytes in `snapshotBlobContents`, reconstructing binary `ISnapshot` contents from both. | BlobManager's persisted base64 text survives the legacy UTF-8-only loader state format without changing that generic format. |
| Persistent overhead | No runtime-level base64 expansion in service storage or blob reads. JSON pending/detached/full-state artifacts still use base64. | Approximately 4/3 expansion in the persisted summary payload and reads, plus runtime encode/decode. |
| Writer request | `containerRuntime.ts` requests the feature only while detached and preserves a persisted detached selection across rehydrate; it does not request it for an unrelated attached existing document. | Passes the configured internal option directly into schema feature selection; it does not contain #28054's explicit detached-only guard. |
| Loader behavior | Captures root `.blobs` child-tree structural blobs and exempts only that root subtree from loading-group rejection. | Functionally the same generic behavior; differences are comments, test wording, and format-specific fixture names, not loader knowledge of the blob format. |
| Focused unit tests | Explicitly verifies uncached attached reads, creator and loaded-state sweep, no attachment-ID exposure, and full-tree concurrency. | Covers the same main lifecycle, GC, non-exposure, mixed-state, and concurrency mechanics, but does not explicitly assert repeated reads remain uncached or separate creator and attached sweep cases. |
| Local-server tests | Adds request counts, binary rehydrate plus a new post-rehydrate blob, attached pending state, frozen capture, and a clean-summary/future-full-tree multi-generation chain with reloads. | Its local-server file covers request counts, binary rehydrate, legacy fallback, and frozen capture. |
| Broader tests | Updates the portable E2E detached-state helper for the generic binary-safe serialization field, but adds no feature-specific portable E2E, stress, or service-load scenario. | Adds portable E2E detached rehydrate and later-summary tests, local-server stress coverage, and service-load option-matrix support. |
| Telemetry | No feature-specific size/count/retry/materialization telemetry. | No additional feature-specific telemetry; both retain the existing generic BlobManager events. |

The #27880 portable E2E tests provide broader service coverage, but they do not inspect the ODSP
ungrouped snapshot contract or prove create-cache versus network payload exclusion. Its later
summary test also does not reproduce #28054's local-server chain with a new future summarizer loaded
from the ordinary summary. These remain complementary coverage rather than evidence of a core
architecture difference.

The encoding distinction is a real architectural difference. #27880 contains the loader's
UTF-8-only serialized-state limitation inside BlobManager by storing text permanently. #28054 fixes
the generic loader limitation instead, allowing this and any future binary structural summary blob
to remain binary in storage.

## Summary actors and intentional materialization

Both designs rely on a separate clean summarizer created by `formCreateSummarizerFn()` in
`summary/summaryHelpers.ts`. Ordinary storage summaries from that actor contain stable handles and
no repeated image bytes.

The still-live creator may re-emit cached bytes if asked to build a summary directly; that is not
the ordinary production summary actor. Full-tree summaries and self-contained
`captureFullContainerState()` artifacts intentionally materialize bytes because they cannot depend
on prior-summary handles or live storage.

## Remaining decisions and validation

For #28054, the remaining work is:

1. Real ODSP proof for grouped structure/blob-ID preservation and payload exclusion on both
   create-cache and network paths.
2. Real-service or portable multi-generation coverage beyond the existing local-server chain,
   where it adds distinct confidence.
3. API Council review for the experimental beta option.
4. Limits, fallback, telemetry, and create retry/idempotency/atomicity validation.
5. Confirmation of behavior on services that may preserve correctness without ODSP-style payload
   exclusion.
6. Feature-specific attaching-state serialized recovery and create-failure/retry coverage.

## Historical note

#28054 originally proposed graduating snapshot summary blob IDs into attachments after load.
That approach was rejected because create-cache and detached-state IDs may be client-synthetic and
because the legacy loader state format serialized structural blobs as UTF-8 strings. The loader now
uses base64 only inside JSON pending/detached/full-state artifacts, with backward loading for the
legacy UTF-8 field. The current #28054 and #27880 designs avoid graduation entirely; it is
historical rationale, not an active implementation alternative.
