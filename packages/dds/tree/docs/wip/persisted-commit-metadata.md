# Persisted Commit Metadata

This document specifies a mechanism for attaching arbitrary, application-defined metadata to a commit,
persisting that metadata in the document,
and querying it later.

The metadata shares the lifetime of the commit it is attached to:
once the commit is trimmed from the trunk, the metadata goes with it.
This keeps growth bounded without requiring any additional garbage collection policy.

The metadata is persisted inline on the commits in the `EditManager` summary.
Storing it on the commit itself is what makes the shared lifetime automatic,
keeps the persisted metadata consistent with the trunk by construction,
and allows the metadata to be paged alongside its commits if summary history is virtualized later.

Both the op format and the summary format carry the metadata under new format versions,
so a document only ever contains metadata once every collaborating client understands it.

## Goals

Attach a JSON-serializable value to the commit produced by a transaction.

Replicate that value to all collaborating clients.

Persist that value in the document so that a client loading from a summary recovers it.

Drop that value automatically when the associated commit is trimmed from the trunk.

Guarantee that metadata written to a document is understood by every client that can open the document.

## Terminology

"Metadata" in this document always means the new persisted commit metadata.

Note that `CommitMetadata` is already an exported interface in `core/rebase/types.ts` describing a commit's `kind` and `isLocal` flags.
New types introduced by this feature must not reuse that name.
Use `PersistedCommitMetadata` for the value type.

## Data model

The metadata is keyed by `RevisionTag` in memory, in a map from `RevisionTag` to `JsonCompatibleReadOnlyObject`.

`RevisionTag` is the correct key for three reasons.
A revision tag is stable across rebase, as documented on `GraphCommit.revision`.
All commits within a single transaction share one revision tag, which `transaction.ts` enforces with assert `0xcaf`.
A revision tag is available at every point in the pipeline where the metadata must be read or written.

### Keep the metadata off `GraphCommit`

Attach the metadata to the in-memory index, not to the `GraphCommit` object.

This is worth stating explicitly because putting it on the commit object is the intuitive move,
and it silently loses data.
`rebaseBranch` in `core/rebase/utils.ts` constructs rebased commits as fresh object literals:

```typescript
newHead = {
	revision: c.revision,
	change,
	parent: newHead,
};
```

There is no spread, so any additional property on a `GraphCommit` is dropped the first time the commit is rebased.
The revision tag survives rebase; the object identity does not.
Keeping the index keyed by `RevisionTag` and joining the two only at encode and decode time keeps this correct.

## Public API

Add an optional field to `RunTransactionParamsAlpha` in `simple-tree/api/transactionTypes.ts`:

```typescript
readonly persistedMetadata?: JsonCompatibleReadOnlyObject;
```

Type it as `JsonCompatibleReadOnlyObject` rather than `unknown`.
The existing `label` field is `unknown` because it never leaves memory.
Persisted metadata must round-trip through JSON, so the constraint belongs in the type system rather than being discovered at encode time.

Thread the parameter through `runTransaction` and `runTransactionAsync` along the same path that `label` already takes.

The transaction API is the only entry point.
An application that wants to annotate a single edit wraps that edit in a transaction of one.

### Nested transactions

The metadata supplied to the outermost transaction is the metadata for the resulting commit.

Metadata supplied to a nested transaction is ignored, mirroring how `label` resolves to the outermost transaction.

### Transactions that produce no commit

A transaction whose body makes no changes produces no commit.
`transaction.ts` gates commit creation on `transactionSteps.length > 0`.

When such a transaction supplies `persistedMetadata`, throw a `UsageError`.
Silently discarding the metadata would present as data loss with no diagnostic.

### Reading

Expose a lookup on the alpha tree surface:

```typescript
getPersistedCommitMetadata(revision: RevisionTag): JsonCompatibleReadOnlyObject | undefined;
```

Return `undefined` for revisions that were never annotated,
for commits that predate this feature,
and for commits whose metadata has been evicted.

Callers correlate a commit to its revision through the existing change events.

## Format versions

Both the op format and the summary format gain a new version for this feature.

Add `v7: 7` to `MessageFormatVersion` in `shared-tree-core/messageFormatV1ToV4.ts`
and to `EditManagerFormatVersion` in `shared-tree-core/editManagerFormatCommons.ts`,
following the precedent set by `v6`, which was introduced and made available for writing in 2.80.0.
Add `v7` to `supportedEditManagerFormatVersions` and to the message equivalent.

Add the corresponding entries to `changeFormatVersionForEditManager` and `changeFormatVersionForMessage`
in `shared-tree/sharedTree.ts`, mapping `v7` to the same `SharedTreeChangeFormatVersion` that `v6` maps to.

The write version is selected from the configured oldest supported client,
via `getCodecTreeForEditManagerFormat(clientVersion: OldestSupportedClientVersion)` and its message counterpart.
A client therefore only begins writing metadata
once `minVersionForCollab` is raised to a version that includes this feature.

This is what makes the metadata dependable.
A document containing metadata can only be opened by a client that understands and preserves it,
so metadata written to a document stays there.
Applications adopting this feature raise `minVersionForCollab` once their clients are saturated.

## Op format

Add the field to the `Message` interface and to the schema returned by the `Message` factory function
in `shared-tree-core/messageFormatV1ToV4.ts`:

```typescript
readonly persistedMetadata?: JsonCompatibleReadOnlyObject;
```

```typescript
persistedMetadata: Type.Optional(JsonCompatibleReadOnlyObjectSchema),
```

Apply the same change to `messageFormatVSharedBranches.ts`.

Add the field to `CommitMessage` in `shared-tree-core/messageTypes.ts`.

Update `encode` and `decode` in `messageCodecV1ToV4.ts` and the shared-branches equivalent to carry the field through,
writing the field only when encoding at `v7` or later.

## Summary format

The metadata is persisted inline on the commits in the `EditManager` summary.

`CommitBase` in `shared-tree-core/editManagerFormatCommons.ts` is composed with `noAdditionalProps`
into both `Commit` and `SequencedCommit`, so the new field is declared on the schema itself:

```typescript
persistedMetadata: Type.Optional(JsonCompatibleReadOnlyObjectSchema),
```

Add the matching optional property to the `Commit` and `EncodedCommit` interfaces in the same file.
This covers the trunk via `SequencedCommit`, peer local branches via `SummarySessionBranch.commits`,
and shared branches via `EncodedSharedBranch`.

`encodeCommit` in `editManagerCodecsCommons.ts` already has everything it needs.
It holds the commit's `revision` and `sessionId`, so it looks the metadata up in the index by revision
and writes it onto the encoded commit with no additional key encoding.
`decodeCommit` reverses this, writing any decoded metadata into the index keyed by the decoded revision.

Emit the field only when encoding at `EditManagerFormatVersion.v7` or later.

Because the metadata travels with the commit, no separate index is persisted,
and the persisted metadata is exactly the set of commits present in the summary.

## Lifecycle

### Local commit

`TreeCheckout` records the metadata for the commit the active transaction is about to produce.

Ordering is safe.
`SharedTreeCore.registerSharedBranch` submits from the branch's `beforeChange` event during the apply,
which runs before the `finally` block in `runWithTransactionLabel` that clears the transaction's label state.

`submitCommit` looks up the metadata by revision and includes it on the outgoing message.

Write the entry into the index at submit time so that it is present for local reads before sequencing.

### Remote commit

`processMessagesCore` decodes each message and writes any metadata into the index,
keyed by the decoded revision.

Do this for both local and remote messages so that the index is populated identically on every client.

### Resubmit

`reSubmitCore` decodes the stored op only to recover the revision,
then re-submits the in-memory enriched commit through `submitCommit`.

`submitCommit` must therefore read the metadata from the index by revision.
Reading it back off the decoded op will not work, because the decoded message is discarded.

### Stashed ops

`applyStashedOp` reconstructs the commit from `{ revision, change }` alone.

Extend it to write the decoded metadata into the index,
so that metadata attached before a disconnect survives the pending-state round trip.

### Rollback

`rollback` removes the commit from the local branch.
Delete the corresponding index entry.

### Eviction

The persisted side needs no work.
A trimmed commit is not serialized, so its metadata leaves the document with it.

Subscribe to the `ancestryTrimmed` event, which `EditManager` emits with the exact `RevisionTag[]` being trimmed,
and delete those revisions from the in-memory index so that memory tracks the trunk.

### Load

Two sources compose to reconstruct the index on a loading client.

Commits at or before the summary's reference sequence number carry their metadata inline,
and `decodeCommit` writes it into the index as the summary is decoded.

Trailing ops, meaning those sequenced after the last summary, carry their metadata inline and are replayed through `processMessagesCore` during load.

No special ordering work is required.
`loadInternal` completes before the runtime delivers trailing ops.

## Characteristics

These are the consequences of the design and should be understood before adopting the feature.

Metadata is absent for all commits created before the feature is enabled.
Every read path must handle `undefined`.

Metadata is retained for exactly as long as its commit is retained.
Under the default trunk eviction policy that is the width of the collaboration window;
under `retainHistory` it is the lifetime of the document.

Metadata travels on every annotated op and occupies space in the summary for as long as its commit survives.
Treat it as a size-sensitive field and document a recommended budget.

Expect op and summary snapshot tests to require regeneration.

## Testing

Cover the following.

Metadata attached to a transaction is readable on the local client immediately.

Metadata replicates to a peer and is readable there after synchronization.

Metadata survives a summary round trip to a freshly loaded client.

Metadata on trailing ops is recovered by a client that loads from a summary predating those ops.

A client loading a summary written before this feature was enabled loads successfully,
and reads back `undefined` for every commit in it.

Metadata is dropped once the associated commit is trimmed, verified by advancing the collaboration window.

Metadata for a commit retained under `retainHistory` survives a summary round trip.

Metadata survives rebase,
verified by annotating a local commit and then sequencing a concurrent remote commit ahead of it.

Metadata survives a disconnect and reconnect, exercising `reSubmitCore`.

Metadata survives the stashed op path via `getRequiredPendingLocalState`.

Metadata is removed on rollback.

A transaction supplying metadata but making no changes throws a `UsageError`.

Nested transactions resolve to the outermost transaction's metadata.

## Work items

1. Add `persistedMetadata` to `RunTransactionParamsAlpha` and thread it through the transaction entry points.
2. Record pending metadata in `TreeCheckout` for the commit under construction.
3. Add `v7` to `MessageFormatVersion` and `EditManagerFormatVersion`, register it as supported,
   and add the `changeFormatVersionFor*` entries.
4. Add the optional field to both message formats, `CommitMessage`, and both message codecs.
5. Add the optional field to `CommitBase` and to the `Commit` and `EncodedCommit` interfaces,
   and carry it through `encodeCommit` and `decodeCommit`.
6. Populate and read the index across `submitCommit`, `processMessagesCore`, `reSubmitCore`, `applyStashedOp`, and `rollback`.
7. Prune the in-memory index on `ancestryTrimmed`.
8. Expose `getPersistedCommitMetadata` on the alpha surface.
9. Add tests per the section above.
10. Regenerate API reports, add a changeset, and update op and summary snapshots.

