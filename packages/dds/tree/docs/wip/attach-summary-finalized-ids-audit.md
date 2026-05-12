# Audit: persisted compressed IDs that may be unfinalized

Status: working notes for the `fix/attach-summary-finalized-ids` work item.
Baseline: branch `fix/attach-summary-finalized-ids`, HEAD `d43d50d7563`
("emit stable UUIDs for non-finalized identifiers in attach summaries").

## Context

`RevisionTagCodec.encode` (`src/core/rebase/revisionTagCodec.ts`) and
`encodeBranchId` (`src/shared-tree-core/branchIdCodec.ts`) both return
`idCompressor.normalizeToOpSpace(...)` with no stable-UUID fallback. For an
ID the local session minted but the IdCompressor has not yet finalized, the
result is a **negative** op-space integer. When an attach summary serializes
the IdCompressor with `withSession=false`, no later reader can resolve those
negatives — and if the attach blob is rehung as a handle in a future
summary, those readers fail to load.

The starting fix (`d43d50d7563`) plugs **one** site: `SpecialField.Identifier`
values in `NodeShapeBasedEncoder.getValueToEncode`
(`src/feature-libraries/chunked-forest/codec/nodeEncoder.ts`), guarded by a
new `idsMustBeFinalized` flag that `ForestSummarizer` sets when
`incrementalSummaryContext === undefined`.

## Sites still at risk

Each site below can write a negative op-space integer into a persisted JSON
blob when the writer's `IIdCompressor` has unfinalized locally-minted IDs
(the SharedTree-attaches-to-already-attached-container scenario). All of
these are reached by the unconditional `summarize` paths of
`EditManagerSummarizer` or `DetachedFieldIndexSummarizer`, so they appear in
**every** attach summary the affected client produces.

### EditManager top-level (per shared branch)

| Field | Site | Codec / encode call | Risk |
|---|---|---|---|
| Commit `revision` on trunk | `editManagerCodecsCommons.ts:52` (`encodeCommit`) | `revisionTagCodec.encode(commit.revision, …)` | Negative op-space possible. Reaches the trunk whenever a locally-minted revision was sequenced before id-compressor finalization. |
| Peer-branch `base` | `editManagerCodecsCommons.ts:120` | `revisionTagCodec.encode(branch.base, …)` | Same. |
| Shared-branch `base` | `editManagerCodecsCommons.ts:153` | `revisionTagCodec.encode(data.base, …)` | Same. `vSharedBranches` only today, but written whenever `data.base !== undefined`. |
| Shared-branch `id` | `editManagerCodecsCommons.ts:140` | `encodeBranchId(context.idCompressor, data.id)` | Negative op-space possible for any non-`"main"` branch id minted locally. |

Each peer-branch commit (`editManagerCodecsCommons.ts:111`) and each
peer-branch `base` (`:121`) is encoded with `originatorId: <peer's
sessionId>`, but `RevisionTagCodec.encode` ignores `originatorId` entirely.
The risk window is "did *this* `IIdCompressor` finalize that tag," not "is
the originator local."

### EditManager via the change codec (trunk commits' `change` field)

The commit's `change` is encoded by the change-family codec stack. Every
revision-tag encode below ultimately calls `RevisionTagCodec.encode`.

| Field | Site | Notes |
|---|---|---|
| `RevisionInfo.revision` / `.rollbackOf` | `feature-libraries/modular-schema/modularChangeCodecV1.ts:410, 414` | Encoded for every changeset that carries revInfos. |
| Detached-node origin revision (builds / refreshers) | `modularChangeCodecV1.ts:305` (`encodeRevisionOpt`) | Wraps `revisionTagCodec.encode`. |
| Identifier values inside builds / refreshers | `modularChangeCodecV1.ts:328` (`fieldsCodec.encode(treesToEncode, …)`) | **Bypasses the d43d50d7563 fix.** This encode context does *not* set `idsMustBeFinalized`, so `NodeShapeBasedEncoder` emits the negative op-space integer. Trunk commits that carry build / refresher trees with identifier-typed nodes therefore still leak unresolvable identifiers — even though the *forest summary blob* itself is now safe. |
| Sequence-field mark effects (MoveIn / Insert / Remove / MoveOut revisions) | `feature-libraries/sequence-field/sequenceFieldCodecV2.ts:69` and the change-atom-id paths (`:81, :101, :113`) | Each goes through `revisionTagCodec.encode` (directly or via `changeAtomIdCodec`). |
| Generic `ChangeAtomId` revisions | `feature-libraries/changeAtomIdCodec.ts:24-27` | Used wherever a field codec records a `revision` distinct from the commit's revision. Optional / value / sequence field codecs all reach this. |

### DetachedFieldIndex

| Site | Behavior |
|---|---|
| `MajorCodec.encode` (v1) — `src/core/tree/detachedFieldIndexCodecV1.ts` | Calls `revisionTagCodec.encode`, then **asserts** `id === "root" \|\| id >= 0` (assert `0x88f`). On an unfinalized local revision this **crashes summarization**. The comment in the file already calls this out as a known v1 gap addressed by v2. |
| `MajorCodec.encode` (v2) — `src/core/tree/detachedFieldIndexCodecV2.ts` | Detects `opSpaceId < 0` and emits the stable UUID via `idCompressor.decompress(major)`. Safe. |

`DetachedFieldIndexFormatVersion.v2` is written when `minVersionForCollab >=
2.52`. Older write configurations still use v1 and remain crash-prone in
the attach-to-attached case.

### Schema

`src/feature-libraries/schema-index/codec.ts` carries no compressed IDs.
No risk.

## What the d43d50d7563 fix covers

- `NodeShapeBasedEncoder.getValueToEncode` for `SpecialField.Identifier`,
  but **only when invoked via `ForestSummarizer.summarizeInternal`** —
  the one call site that threads `idsMustBeFinalized: true` into
  `FieldBatchEncodingContext`.

## What it does not cover

1. All revision-tag emissions in the EditManager summary (per-commit
   revisions on trunk, peer-branch bases, shared-branch bases, and every
   revision tag inside trunk commits' encoded changes — `RevisionInfo`,
   sequence-mark revisions, change-atom-id revisions, detached-node origin
   revisions).
2. Branch ID emissions (`encodeBranchId` at
   `editManagerCodecsCommons.ts:140`).
3. Identifier values inside builds / refreshers inside trunk commits —
   `fieldsCodec.encode` in `modularChangeCodecV1.ts:328` reaches the
   schema-based encoder without the `idsMustBeFinalized` flag.
4. `detachedFieldIndexCodecV1.MajorCodec.encode` still asserts non-negative
   and will crash instead of just persisting a bad value.

## Chosen mitigation

The persisted-format-level fixes above were not pursued. Instead, the
forward fix in commit `d43d50d7563` is left to prevent **new** documents
from being written with unresolvable op-space IDs, and a separate
*opt-in healing* path is added in the chunked-forest decoder to recover
**existing** broken documents at load time:

- `chunkDecoding.readValue` (the `SpecialField.Identifier` path) wraps the
  `idCompressor.normalizeToSessionSpace` + `decompress` call in a
  try/catch. When it throws and `IdDecodingContext.healUnresolvableIdentifiersOnDecode`
  is `true`, the decoder returns a deterministic stable UUID synthesized
  via `uuidv5(`${sharedObjectId}|${opSpaceId}`, healingNamespace)`. All
  readers of the same persisted blob agree on the resulting value.
- The chunked-forest already accepts string-typed identifier values (the
  encoder's pre-existing fallback at `nodeEncoder.ts:78` writes stable
  UUIDs when `idsMustBeFinalized` is set), so the healed value flows
  through subsequent rounds of encoding without further change.
- `FieldBatchEncodingContext` and `IdDecodingContext` gain
  `healUnresolvableIdentifiersOnDecode?: boolean` and `sharedObjectId?: string`.
  These are populated by callers building the context.
- `ChangeEncodingContext` and `EditManagerEncodingContext` carry the same
  fields so the flag and shared-object id reach the chunked-forest decode
  invoked via `modularChangeCodecV1.decodeDetachedNodes` (builds /
  refreshers inside trunk-commit changes) as well as the direct invocation
  via `ForestSummarizer.load`.
- `SharedTreeOptionsBeta` gains `healUnresolvableIdentifiersOnDecode?: boolean`
  (default `false`). The flag is plumbed from there into the
  `ForestSummarizer`'s `encoderContext` (`sharedTree.ts`) and into
  `EditManagerSummarizer` via additional constructor arguments
  (`sharedTreeCore.ts`).
- `RevisionTagCodec`, `detachedFieldIndexCodecV1`, and
  `detachedFieldIndexCodecV2` are intentionally left unchanged.
  `detachedFieldIndexCodecV2.MajorCodec` already encodes long IDs when
  the originator session is unfinalized at summary time, so those
  codecs do not produce unresolvable persisted IDs to heal.

The flag is exposed to applications via `configuredSharedTreeBetaLegacy`
and is intentionally `@beta`-shaped: enabling it for documents that are
not actually corrupt would mask genuine bugs that otherwise surface as
decode failures, so adoption should be deliberate.

Wire compatibility: the heal path runs only at decode time, only when the
flag is explicitly enabled, and only when `normalizeToSessionSpace` would
otherwise throw. No persisted format changes; the only on-wire effect is
that string-typed identifiers (already an accepted form per the
`d43d50d7563` encoder fallback) become more likely to appear when healed
documents are re-summarized.
