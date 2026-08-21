# Persisted Commit Metadata

This document specifies a mechanism for attaching arbitrary, application-defined metadata to a commit,
persisting that metadata in the document,
and querying it later.

The metadata shares the lifetime of the commit it is attached to:
once the commit is evicted from the trunk, the metadata is dropped.
This keeps growth bounded without requiring any additional garbage collection policy.

The design deliberately avoids introducing a new persisted format version.
It achieves this by using two extension points that already tolerate additive change:
optional properties on the op envelope, and a new sub-tree in the summary.

## Goals

Attach a JSON-serializable value to the commit produced by a transaction.

Replicate that value to all collaborating clients.

Persist that value in the document so that a client loading from a summary recovers it.

Drop that value automatically when the associated commit leaves the collaboration window.

Ship without bumping `MessageFormatVersion`, `EditManagerFormatVersion`, or `minVersionForCollab`.

## Terminology

"Metadata" in this document always means the new persisted commit metadata.

Note that `CommitMetadata` is already an exported interface in `core/rebase/types.ts` describing a commit's `kind` and `isLocal` flags.
New types introduced by this feature must not reuse that name.
Use `PersistedCommitMetadata` for the value type.

## Data model

The metadata is keyed by `RevisionTag`.

This is the correct key for three reasons.
A revision tag is stable across rebase, as documented on `GraphCommit.revision`.
All commits within a single transaction share one revision tag, which `transaction.ts` enforces with assert `0xcaf`.
A revision tag is available at every point in the pipeline where the metadata must be read or written.

The in-memory store is a map from `RevisionTag` to an entry containing both the metadata and the originating session ID:

```typescript
interface PersistedCommitMetadataEntry {
	readonly sessionId: SessionId;
	readonly metadata: JsonCompatibleReadOnlyObject;
}
```

The session ID must be stored alongside the metadata.
Encoding a `RevisionTag` requires an `originatorId`, as seen in `encodeCommit` in `editManagerCodecsCommons.ts`,
which passes `originatorId: commit.sessionId` into `revisionTagCodec.encode`.
Without the session ID, the index cannot encode its own keys at summarization time.

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

## Op format

`Message` in `shared-tree-core/messageFormatV1ToV4.ts` is SharedTree's own op payload type.
Its TypeBox schema is declared with a bare `Type.Object({...})` and no `ObjectOptions`,
so additional properties are permitted by both the TypeBox compiler and the AJV validator used in tests.
A client that does not know about the new field will validate the message successfully and ignore the field,
because the codec's `decode` destructures only the properties it names.

Add the field explicitly rather than relying on an undeclared property.

Add to the `Message` interface and to the schema returned by the `Message` factory function:

```typescript
readonly persistedMetadata?: JsonCompatibleReadOnlyObject;
```

```typescript
persistedMetadata: Type.Optional(JsonCompatibleReadOnlyObjectSchema),
```

Apply the same change to `messageFormatVSharedBranches.ts`.

Add a comment on both schemas recording that additional properties are intentionally permitted,
and that adding `additionalProperties: false` would break forward compatibility for this field.

Add the field to `CommitMessage` in `shared-tree-core/messageTypes.ts`.

Update `encode` and `decode` in `messageCodecV1ToV4.ts` and the shared-branches equivalent to carry the field through.

Do not introduce a new `MessageFormatVersion`.
Existing clients speaking the same version accept and ignore the new field.

## Summary format

Add a new `Summarizable` with the key `"CommitMetadata"`.
Register it in the summarizables array constructed in `shared-tree/sharedTree.ts`,
alongside `SchemaSummarizer`, `ForestSummarizer`, and `DetachedFieldIndexSummarizer`.

The summarizable persists the full map.
Encode each `RevisionTag` key with `RevisionTagCodec`, supplying `originatorId` from the stored session ID and the runtime's `IIdCompressor`.

Build the summarizable on the `versionedSummarizer` pattern so that its blob carries its own format version from the outset.

`loadInternal` in `sharedTreeCore.ts` iterates the client's own summarizables and looks each key up under `indexes/`.
It never enumerates the keys present in the snapshot.
A client that does not know about this summarizable therefore ignores the sub-tree entirely.

The `load` implementation must call `await services.contains(...)` and return early when the blob is absent.
`scopeStorageService` asserts `0xc20` inside `getSnapshotTree()` when a scoped path is missing,
so a summarizable that reaches for storage unconditionally will fail against every document created before this feature shipped.

Do not introduce a new `EditManagerFormatVersion`.
The existing `Commit` and `SequencedCommit` schemas are sealed with `additionalProperties: false` and are not modified.

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
keyed by the decoded revision and the message's originator session ID.

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

Subscribe to the `ancestryTrimmed` event, which `EditManager` emits with the exact `RevisionTag[]` being trimmed.
Delete those revisions from the index.

This is what bounds growth, and it is the only removal path in steady-state operation.

### Load

Two sources compose to reconstruct the index on a loading client.

Commits at or before the summary's reference sequence number come from the summarizable.

Trailing ops, meaning those sequenced after the last summary, carry their metadata inline and are replayed through `processMessagesCore` during load.

No special ordering work is required.
`loadInternal` completes before the runtime delivers trailing ops.

## Compatibility characteristics

These are the consequences of the additive approach and should be understood before adopting the feature.

A client that does not implement this feature will, when it produces a summary,
write a summary containing no `"CommitMetadata"` sub-tree.
All persisted metadata in the document is lost at that point, with no error.

The same client ignores the metadata on incoming ops.
Combined with the above, this means metadata is best-effort in a mixed-version collaboration session.
Applications must not depend on it for correctness.

Metadata is absent for all commits created before the feature ships.
Every read path must handle `undefined`.

Metadata travels on every annotated op and is retained in the summary for the width of the collaboration window.
Treat it as a size-sensitive field and document a recommended budget.

Expect op and summary snapshot tests to require regeneration.

## Testing

Cover the following.

Metadata attached to a transaction is readable on the local client immediately.

Metadata replicates to a peer and is readable there after synchronization.

Metadata survives a summary round trip to a freshly loaded client.

Metadata on trailing ops is recovered by a client that loads from a summary predating those ops.

A client loading a summary that contains no `"CommitMetadata"` sub-tree loads successfully.

Metadata is dropped once the associated commit is trimmed, verified by advancing the collaboration window.

Metadata survives a disconnect and reconnect, exercising `reSubmitCore`.

Metadata survives the stashed op path via `getRequiredPendingLocalState`.

Metadata is removed on rollback.

A transaction supplying metadata but making no changes throws a `UsageError`.

Nested transactions resolve to the outermost transaction's metadata.

## Work items

1. Add `persistedMetadata` to `RunTransactionParamsAlpha` and thread it through the transaction entry points.
2. Record pending metadata in `TreeCheckout` for the commit under construction.
3. Implement the `"CommitMetadata"` summarizable, including revision tag encoding and the `contains` guard on load.
4. Register the summarizable in `sharedTree.ts`.
5. Add the optional field to both message formats, `CommitMessage`, and both message codecs.
6. Populate and read the index across `submitCommit`, `processMessagesCore`, `reSubmitCore`, `applyStashedOp`, and `rollback`.
7. Prune the index on `ancestryTrimmed`.
8. Expose `getPersistedCommitMetadata` on the alpha surface.
9. Add tests per the section above.
10. Regenerate API reports, add a changeset, and update op and summary snapshots.
