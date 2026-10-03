# Persisted Commit Metadata

This document specifies a mechanism for attaching arbitrary, application-defined metadata to a commit,
persisting that metadata in the document,
and querying it later.

The metadata shares the lifetime of the commit it is attached to:
once the commit is trimmed from the trunk, the metadata goes with it.
This keeps growth bounded without requiring any additional garbage collection policy.

The metadata lives directly on the commit — on `GraphCommit` in memory and inline on the commits in the
`EditManager` summary. There is no separate index to populate, reconcile, or prune.
Storing it on the commit is what makes the shared lifetime automatic,
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

Add the metadata to `GraphCommit` in `core/rebase/types.ts` as a **required** property:

```typescript
readonly persistedMetadata: JsonCompatibleReadOnlyObject | undefined;
```

Required, not optional. The value may be `undefined`, but the property must always be written.
`GraphCommit` does not appear in any API report, so this is an internal change.

### Why required

Two places rebuild a commit from its parts rather than spreading it, and both would silently drop an
optional property.

`mintCommit` in `core/rebase/types.ts`:

```typescript
const { revision, change } = commit;
return { revision, change, parent };
```

and `rebaseBranch` in `core/rebase/utils.ts`:

```typescript
newHead = {
	revision: c.revision,
	change,
	parent: newHead,
};
```

Declaring the property required turns both into compile errors, so the type system enumerates every
site that has to make a decision instead of leaving the loss silent.

### Propagate at the rebuild sites — do not write `undefined` to satisfy the compiler

This is the one way to get this wrong.

A rebased or re-parented commit is the **same logical commit** as its source: same revision, same
change, same metadata. Both sites above must copy `persistedMetadata` from the commit they are
rebuilding. Writing `persistedMetadata: undefined` there compiles cleanly and reintroduces exactly
the data loss the required property exists to prevent.

`undefined` is correct only where a genuinely new commit is minted that no caller annotated — the
inverse commit produced by reverting, and rollback commits.

### Why the commit and not a side index

The metadata is reachable wherever a commit is, which is every point in the pipeline that needs it.
It is garbage collected with its commit, so trimming needs no participation. It cannot drift out of
sync with the commit graph, because there is no second structure to keep in sync. And it survives
moving between branches for free: an application that renders from a fork and publishes by merging
that fork into the main branch carries its metadata along with the commits it merges, with no
cross-branch bookkeeping.

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

Metadata describes the commit a transaction produces.
A transaction that produces no commit has no commit to describe, and its metadata is discarded without error.

Two paths reach this.
A transaction whose body makes no changes produces no commit, because `transaction.ts` gates commit
creation on `transactionSteps.length > 0`.
A transaction that is explicitly rolled back likewise produces nothing.

This is defined behavior rather than an oversight, for three reasons.

Rollback is a sanctioned outcome, not a fault.
Applications roll a transaction back when they detect an invalid edit part way through, and that path
returns an error to their own caller; raising from the tree would convert a handled result into an
exception.

Whether a body will produce a change is not knowable before running it, so any other rule forces every
annotated transaction to be wrapped defensively.

An application whose "no change means no checkpoint" rule is the point of annotating in the first place
gets that behavior for free.

Callers that need to detect the case can compare `branchHistory.getHeadCommit()` across the call.

### Reading

Expose the metadata on `TreeBranchCommitMetadata` in `simple-tree/api/tree.ts`, the per-commit object
introduced alongside `TreeBranchHistory`:

```typescript
readonly persistedMetadata: JsonCompatibleReadOnlyObject | undefined;
```

`LazyTreeBranchCommitMetadata` in `shared-tree/history.ts` wraps the `GraphCommit` it describes, so
this reads straight through to the commit.

Reading is therefore a property of history navigation rather than a separate lookup. A caller reaches
a commit through `branchHistory.getHeadCommit()` and the `parent` chain, and the metadata is already
there:

```typescript
for (
	let commit = view.branchHistory.getHeadCommit();
	commit !== undefined;
	commit = commit.parent
) {
	const metadata = commit.persistedMetadata;
}
```

The value is `undefined` for commits that were never annotated and for commits created before the
feature was enabled. There is deliberately no lookup by revision: a caller holding only a revision
walks the chain to find its commit. Adding a revision-keyed accessor would require a side index, which
is the structure this design removes.

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
It holds the commit, so it reads `persistedMetadata` directly and writes it onto the encoded commit.
`decodeCommit` reverses this, setting `persistedMetadata` on the `GraphCommit` it reconstructs.

Emit the field only when encoding at `EditManagerFormatVersion.v7` or later.

Because the metadata travels with the commit, no separate index is persisted,
and the persisted metadata is exactly the set of commits present in the summary.

## Lifecycle

Because the metadata is a property of the commit, most stages need no bookkeeping at all: anything that
already carries a commit carries its metadata. What follows is limited to the places that construct a
commit and must therefore supply the property.

### Local commit

`TreeCheckout` holds the metadata supplied to the active transaction and attaches it to the commit that
transaction produces, so the commit carries it from the moment it exists.

Ordering is safe.
`SharedTreeCore.registerSharedBranch` submits from the branch's `beforeChange` event during the apply,
which runs before the `finally` block in `runWithTransactionLabel` that clears the transaction's label state.

`submitCommit` reads `persistedMetadata` off the commit and includes it on the outgoing message.

Because the metadata is present on the commit before sequencing, local reads through the branch history
see it immediately.

### Commits made on a branch

A transaction that runs on a fork produces a commit that is not submitted until the fork is merged into
a branch that submits.

This requires no special handling. The metadata is on the commit, and merging carries the commit
across, so the metadata arrives with it — provided the rebuild sites propagate rather than reset the
property, per the data model.

This path is worth testing directly, because an application that renders from a fork exercises it on
every edit.

### Remote commit

`processMessagesCore` decodes each message and sets the decoded metadata on the commit it constructs.

### Resubmit

`reSubmitCore` decodes the stored op only to recover the revision,
then re-submits the in-memory enriched commit through `submitCommit`.

That in-memory commit already carries its metadata, so `submitCommit` re-reads it from the commit and
nothing has to be recovered from the decoded message.

### Stashed ops

`applyStashedOp` reconstructs the commit from `{ revision, change }` alone.

Extend it to set `persistedMetadata` from the decoded op,
so that metadata attached before a disconnect survives the pending-state round trip.

### Rollback

`rollback` removes the commit from the local branch, and the metadata goes with it.
Nothing else to do.

### Eviction

Nothing to do, on either side.

A trimmed commit is not serialized, so its metadata leaves the document with it. In memory, the
metadata is a property of the commit object and is collected with it, so no `ancestryTrimmed`
subscription is required.

### Load

Two sources compose on a loading client, and both attach the metadata as the commit is built.

Commits at or before the summary's reference sequence number carry their metadata inline,
and `decodeCommit` sets it on each `GraphCommit` as the summary is decoded.

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
This is the regression test for the rebuild sites described in the data model.

Metadata attached to a transaction on a fork is readable after that fork is merged into the main
branch, and reaches a peer once the merge is sequenced.

Metadata attached on a fork is still readable after the fork itself is disposed.

Metadata survives a disconnect and reconnect, exercising `reSubmitCore`.

Metadata survives the stashed op path via `getRequiredPendingLocalState`.

Metadata is removed on rollback.

A transaction supplying metadata but making no changes discards the metadata and does not throw.

A transaction supplying metadata that is explicitly rolled back discards the metadata and does not throw.

Nested transactions resolve to the outermost transaction's metadata.

## Work items

1. Add `persistedMetadata` to `RunTransactionParamsAlpha` and thread it through the transaction entry points.
2. Add the required `persistedMetadata` property to `GraphCommit`, then work through the resulting
   compile errors. Propagate at `mintCommit` and `rebaseBranch`; set `undefined` only where a genuinely
   new commit is minted.
3. Carry the transaction's metadata onto the commit it produces in `TreeCheckout`.
4. Add `v7` to `MessageFormatVersion` and `EditManagerFormatVersion`, register it as supported,
   and add the `changeFormatVersionFor*` entries.
5. Add the optional field to both message formats, `CommitMessage`, and both message codecs.
6. Add the optional field to `CommitBase` and to the `Commit` and `EncodedCommit` interfaces,
   and carry it through `encodeCommit` and `decodeCommit`.
7. Set the property on the commits built by `processMessagesCore` and `applyStashedOp`, and read it
   from the commit in `submitCommit`.
8. Expose `persistedMetadata` on `TreeBranchCommitMetadata`, reading through from the wrapped commit.
9. Add tests per the section above.
10. Regenerate API reports, add a changeset, and update op and summary snapshots.

