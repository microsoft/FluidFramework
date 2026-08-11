/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Listenable } from "@fluidframework/core-interfaces";
import type {
	OpSpaceCompressedId,
	SessionId,
	SessionSpaceCompressedId,
	StableId,
} from "@fluidframework/id-compressor";
import * as Type from "@sinclair/typebox";

import {
	type Brand,
	type JsonCompatibleReadOnly,
	type NestedMap,
	RangeMap,
	brand,
	brandedNumberType,
	brandedStringType,
	comparePartialStrings,
} from "../../util/index.js";
import type { RevertibleAlpha } from "../revertible.js";

/**
 * The identifier for a particular session/user/client that can generate `GraphCommit`s
 */
export const SessionIdSchema = brandedStringType<SessionId>();

/**
 * A unique identifier for a commit. Commits that have been rebased, but are semantically
 * the same, will share the same revision tag.
 *
 * The constant 'root' is reserved for the trunk base: minting a SessionSpaceCompressedId is not
 * possible on readonly clients. These clients generally don't need ids, but  must be done at tree initialization time.
 */
export type RevisionTag = SessionSpaceCompressedId | "root";
export type EncodedRevisionTag = Brand<OpSpaceCompressedId, "EncodedRevisionTag"> | "root";
export const RevisionTagSchema = Type.Union([
	Type.Literal("root"),
	brandedNumberType<Exclude<EncodedRevisionTag, string>>(),
]);

export type EncodedStableId = Brand<StableId, "EncodedStableId">;
export const StableIdSchema = Type.String();

/**
 * An ID which is unique within a revision of a `ModularChangeset`.
 * @remarks
 * Always a real number (never `NaN` or +/- `Infinity`).
 *
 * A `ModularChangeset` which is a composition of multiple revisions may contain duplicate `ChangesetLocalId`s,
 * but they are unique when qualified by the revision of the change they are used in.
 */
export type ChangesetLocalId = Brand<number, "ChangesetLocalId">;

/**
 * A globally unique ID for an atom of change, or a node associated with the atom of change.
 * *
 * @privateRemarks
 * TODO: Rename this to be more general.
 */
export interface ChangeAtomId {
	/**
	 * Uniquely identifies the changeset within which the change was made.
	 * Only undefined when referring to an anonymous changesets.
	 */
	readonly revision?: RevisionTag;
	/**
	 * Uniquely identifies, in the scope of the changeset, the change made to the field.
	 */
	readonly localId: ChangesetLocalId;
}

export type EncodedChangeAtomId = [ChangesetLocalId, EncodedRevisionTag] | ChangesetLocalId;

export type ChangeAtomIdMap<T> = NestedMap<RevisionTag | undefined, ChangesetLocalId, T>;

/**
 * Returns true iff `a` and `b` are the same.
 */
export function areEqualChangeAtomIds(a: ChangeAtomId, b: ChangeAtomId): boolean {
	return a.localId === b.localId && a.revision === b.revision;
}

export function areEqualChangeAtomIdOpts(
	a: ChangeAtomId | undefined,
	b: ChangeAtomId | undefined,
): boolean {
	if (a === undefined || b === undefined) {
		return a === b;
	}

	return areEqualChangeAtomIds(a, b);
}

/**
 * Returns a ChangeAtomId with the given revision and local ID.
 */
export function makeChangeAtomId(
	localId: ChangesetLocalId,
	revision?: RevisionTag,
): ChangeAtomId {
	return revision === undefined ? { localId } : { localId, revision };
}

export function asChangeAtomId(id: ChangesetLocalId | ChangeAtomId): ChangeAtomId {
	return typeof id === "object" ? id : { localId: id };
}

export function taggedAtomId(
	id: ChangeAtomId,
	revision: RevisionTag | undefined,
): ChangeAtomId {
	return makeChangeAtomId(id.localId, id.revision ?? revision);
}

export function taggedOptAtomId(
	id: ChangeAtomId | undefined,
	revision: RevisionTag | undefined,
): ChangeAtomId | undefined {
	if (id === undefined) {
		return undefined;
	}
	return taggedAtomId(id, revision);
}

export function offsetChangeAtomId<T extends ChangeAtomId>(id: T, offset: number): T {
	return { ...id, localId: brand(id.localId + offset) };
}

// #region These comparison functions are used instead of e.g. `compareNumbers` as a performance optimization

export function compareChangesetLocalIds(a: ChangesetLocalId, b: ChangesetLocalId): number {
	return a - b; // No need to consider `NaN` or `Infinity` since ChangesetLocalId is always a real number
}

export function comparePartialChangesetLocalIds(
	a: ChangesetLocalId | undefined,
	b: ChangesetLocalId | undefined,
): number {
	if (a === undefined) {
		return b === undefined ? 0 : -1;
	} else if (b === undefined) {
		return 1;
	}
	return compareChangesetLocalIds(a, b);
}

// #endregion

/**
 * A node in a graph of commits. A commit's parent is the commit on which it was based.
 */
export interface GraphCommit<TChange> {
	/**
	 * The tag for this commit.
	 * @remarks
	 * If this commit is rebased, the corresponding rebased commit will retain this tag.
	 * With the exception of transaction commits (which all share the same tag), this tag is unique within a given branch history.
	 */
	readonly revision: RevisionTag;
	/** The change that will result from applying this commit */
	readonly change: TChange;
	/** The parent of this commit, on whose change this commit's change is based */
	readonly parent?: GraphCommit<TChange>;
}

/**
 * The type of a commit. This is used to describe the context in which the commit was created.
 *
 * @public
 */
export enum CommitKind {
	/** A commit corresponding to a change that is not the result of an undo/redo from this client. */
	Default,
	/** A commit that is the result of an undo from this client. */
	Undo,
	/** A commit that is the result of a redo from this client. */
	Redo,
}

/**
 * Information about a commit that has been applied.
 *
 * @sealed @public
 */
export interface CommitMetadata {
	/**
	 * A {@link CommitKind} enum value describing whether the commit represents an Edit, an Undo, or a Redo.
	 */
	readonly kind: CommitKind;
	/**
	 * Indicates whether the commit is a local edit
	 */
	readonly isLocal: boolean;
}

/**
 * Information about a change that has been applied by the local client.
 * @sealed @alpha
 */
export interface LocalChangeMetadata extends CommitMetadata {
	/**
	 * Whether the change was made on the local machine/client or received from a remote client.
	 */
	readonly isLocal: true;
	/**
	 * Returns a serializable object that encodes the change.
	 * @remarks This is only available for local changes.
	 * This change object can be {@link TreeBranchAlpha.applyChange | applied to another branch} in the same state as the one which generated it.
	 * The change object must be applied to a SharedTree with the same IdCompressor session ID as it was created from.
	 * @privateRemarks
	 * This is a `SerializedChange` from treeCheckout.ts.
	 */
	getChange(): JsonCompatibleReadOnly;
	/**
	 * Returns an object (a {@link RevertibleAlpha | "revertible"}) that can be used to revert the change that produced this event.
	 * @remarks This is only available for local changes.
	 * If the change is not revertible (for example, it was a change to the application schema), then this will return `undefined`.
	 * Revertibles should be disposed when they are no longer needed.
	 * @param onDisposed - A callback that will be invoked when the `Revertible` is disposed.
	 * This happens when the `Revertible` is disposed manually or when the `TreeView` that the `Revertible` belongs to is disposed - whichever happens first.
	 * This is typically used to clean up any resources associated with the `Revertible` in the host application.
	 * @throws Throws an error if called outside the scope of the `changed` event that provided it.
	 */
	getRevertible(
		onDisposed?: (revertible: RevertibleAlpha) => void,
	): RevertibleAlpha | undefined;

	/**
	 * Optional label provided by the user when commit was created.
	 * This can be used by undo/redo to group or classify edits.
	 */
	readonly label?: unknown;

	/**
	 * A set of {@link RunTransactionParamsBeta.label | labels} for all transactions (nested or otherwise)
	 * that made up this change.
	 * This can be used to identify, group, or filter changes — for example, to decide whether a change
	 * should be included in an undo/redo stack.
	 *
	 * @remarks
	 * The optional {@link TransactionLabels.tree | tree} property provides the structural nesting
	 * of the transactions as a {@link LabelTree}.
	 *
	 * The `tree` property is present whenever the change was produced by a transaction that
	 * includes at least one label. If the change was unlabeled,
	 * `tree` is `undefined` and the set is empty.
	 *
	 * @example
	 * Checking whether a change was produced by a specific kind of transaction:
	 * ```typescript
	 * branch.events.on("changed", (metadata) => {
	 *   if (metadata.labels.has("testLabel")) {
	 *     // This change came from a transaction labeled "testLabel"
	 *   }
	 * });
	 * ```
	 *
	 * @example
	 * A nested transaction produces a tree that reflects the nesting:
	 * ```typescript
	 * tree.runTransaction(() => {
	 *   tree.runTransaction(() => { ... }, { label: "inner" });
	 * }, { label: "outer" });
	 * // metadata.labels.has("inner") === true
	 * // metadata.labels.tree will be:
	 * //   { label: "outer", sublabels: [{ label: "inner", sublabels: [] }] }
	 * ```
	 */
	readonly labels: TransactionLabels;

	/**
	 * Events related to a local change that has been applied.
	 */
	readonly events: Listenable<LocalCommitEvents>;
}

/**
 * Events related to a local commit that has been applied.
 * @sealed @alpha
 */
export interface LocalCommitEvents {
	/**
	 * Fired once a commit has been ordered by the sequencing service.
	 * @param outcome - information about what changes from the commit were applied or not
	 *
	 * @remarks
	 * Once a commit is sequenced, the following guarantees hold:
	 * 1. The changes carried by the commit have been persisted and other peers are able to see them.
	 * 2. There can be no more concurrent changes sequenced before this commit, which means this commit has reached its settled form.
	 *
	 * This event can be used by applications to inform the end user that their changes have been saved (`CommitOutcome.FullyApplied`) or rejected (`CommitOutcome.FullyDropped` and `CommitOutcome.NewContentOnly`).
	 * It can also be used to queue up a new attempt at making the rejected changes. Note however that new edits must be made outside of the event callback.
	 * @example Notifying the user of the outcome and allowing them to retry:
	 * ```typescript
	 * // Use `asAlpha` API to access the settled event API
	 * const view = asAlpha(tree.viewWith(config));
	 *
	 * // Function to clear all contents of the tree, with a precondition that no changes have occurred.
	 * const clearAllContents = () => {
	 * 	view.runTransaction(
	 * 		() => {
	 * 			// Remove all contents at the root
	 * 			view.root.removeRange();
	 * 		},
	 * 		{ preconditions: [{ type: "noChange" }] },
	 * 	);
	 * };
	 *
	 * // Register the logic for notifying the user of the outcome and allow them to retry
	 *  view.events.on("changed", (metadata) => {
	 * 	if (metadata.isLocal) {
	 * 		metadata.events.on("settled", (outcome) => {
	 * 			if (outcome === CommitOutcome.FullyApplied) {
	 * 				alert("Clear operation succeeded.");
	 * 			} else {
	 * 				const shouldTryAgain = confirm(
	 * 					"The contents have changed. Do you still want to clear everything?",
	 * 				);
	 * 				if (shouldTryAgain) {
	 * 					// It is invalid to make edits during the event callback, so we schedule the retry to occur asynchronously.
	 * 					setTimeout(clearAllContents);
	 * 				} else {
	 * 					alert("Clear operation aborted.");
	 * 				}
	 * 			}
	 * 		});
	 * 	}
	 * });
	 *
	 * // First attempt to clear all contents.
	 * // This will synchronously trigger the changed "event" and register the listener for the settled event.
	 * clearAllContents();
	 * ```
	 */
	settled(outcome: CommitOutcome): void;
}

/**
 * A tree representing the nesting structure of transaction labels.
 *
 * @remarks
 * Each transaction contributes a node whose {@link LabelTree.label} is its
 * {@link RunTransactionParamsBeta.label | label} (or `undefined` if no label was provided).
 * When transactions are nested, inner transaction nodes become {@link LabelTree.sublabels | sublabels}
 * of outer ones.
 *
 * @sealed @alpha
 */
export interface LabelTree {
	/**
	 * The label for this transaction, or `undefined` if no label was provided.
	 */
	label: unknown;

	/**
	 * The label trees of any nested transactions within this one.
	 */
	sublabels: LabelTree[];
}

/**
 * A set of transaction labels with an optional structural tree.
 *
 * @remarks
 * The set contains all label values from the transactions that produced the change.
 * Use standard {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set | Set}
 * methods to check for specific labels.
 *
 * The optional {@link TransactionLabels.tree | tree} property provides the structural nesting
 * of the transactions as a {@link LabelTree}.
 *
 * @sealed @alpha
 */
export type TransactionLabels = Set<unknown> & { tree?: LabelTree };

/**
 * Details about what changes from a commit were applied or not.
 * @alpha
 */
export enum CommitOutcome {
	/**
	 * All of the changes in the commit were applied.
	 */
	FullyApplied,
	/**
	 * None of the changes in the commit were applied.
	 * @remarks
	 * This occurs when an implicit constraint has been violated.
	 * Implicit constraints are those that are automatically enforced by SharedTree on all changes.
	 *
	 * Such a violation typically arises in one of two scenarios:
	 * 1. A schema change conflicts with a concurrent data or schema change that was sequenced before it.
	 * 2. A data change conflicts with a concurrent schema change that was sequenced before it.
	 */
	FullyDropped,
	/**
	 * Only the creation of new content was applied.
	 * All other changes (including the insertion and/or modification of the new content) were dropped.
	 * @remarks
	 * This occurs when at least one explicit constraint has been violated
	 * (and no implicit constraints were violated.)
	 *
	 * Explicit constraints are those that are explicitly added
	 * through {@link RunTransactionParamsAlpha.preconditions | preconditions}
	 * or {@link TransactionCallbackStatusAlpha.preconditionsOnRevert | preconditionsOnRevert}.
	 *
	 * The new content may be edited (and potentially inserted) by subsequent commits,
	 * assuming those commits are not themselves subject to constraint violations.
	 * Note that, if left uninserted, new content will eventually be garbage-collected from the document.
	 *
	 * Applications typically choose to treat this outcome as equivalent to {@link CommitOutcome.FullyDropped | FullyDropped}
	 * and, when reattempting the change, generate a different copy of the new content if any.
	 *
	 * @privateRemarks
	 * New content is preserved so that subsequent commits that reference it without having to carry their own copies of it.
	 * This can become expensive: one extra copy per subsequent commit, included in both in cases where we know the prior commit was dropped and in cases where we don't yet know.
	 * We could instead drop all subsequent commits that reference the new content, but that would create a greater risk of data loss.
	 */
	NewContentOnly,
}

/**
 * Information about a change that has been applied by a remote client.
 * @sealed @alpha
 */
export interface RemoteChangeMetadata extends CommitMetadata {
	/**
	 * Whether the change was made on the local machine/client or received from a remote client.
	 */
	readonly isLocal: false;
	/**
	 * Returns a serializable object that encodes the change.
	 * @remarks This is only available for {@link LocalChangeMetadata | local changes}.
	 */
	readonly getChange?: undefined;
	/**
	 * Returns an object (a {@link RevertibleAlpha | "revertible"}) that can be used to revert the change that produced this event.
	 * @remarks This is only available for {@link LocalChangeMetadata | local changes}.
	 */
	readonly getRevertible?: undefined;
	/**
	 * Label provided by the user when commit was created.
	 * @remarks This is only available for {@link LocalChangeMetadata | local changes}.
	 */
	readonly label?: undefined;
	/**
	 * A set of labels from nested transaction labels.
	 * @remarks This is always empty for remote changes. Labels are only available for {@link LocalChangeMetadata | local changes}.
	 */
	readonly labels: TransactionLabels;
}

/**
 * Information about a {@link LocalChangeMetadata | local} or {@link RemoteChangeMetadata | remote} change that has been applied.
 * @sealed @alpha
 */
export type ChangeMetadata = LocalChangeMetadata | RemoteChangeMetadata;

/**
 * Creates a new graph commit object. This is useful for creating copies of commits with different parentage.
 * @param parent - the parent of the new commit
 * @param commit - the contents of the new commit object
 * @returns the new commit object
 */
// Note that this function is synchronous, and therefore it is not a Promise.
// However, it is still a strong commit-mint.
export function mintCommit<TChange>(
	parent: GraphCommit<TChange>,
	commit: Omit<GraphCommit<TChange>, "parent">,
): GraphCommit<TChange> {
	const { revision, change } = commit;
	return {
		revision,
		change,
		parent,
	};
}

export type ChangeAtomIdRangeMap<V> = RangeMap<ChangeAtomId, V>;

export function newChangeAtomIdRangeMap<V>(
	offsetValue?: (value: V, offset: number) => V,
): ChangeAtomIdRangeMap<V> {
	return new RangeMap(offsetChangeAtomId, subtractChangeAtomIds, offsetValue);
}

export function subtractChangeAtomIds(a: ChangeAtomId, b: ChangeAtomId): number {
	const cmp = comparePartialRevisions(a.revision, b.revision);
	if (cmp !== 0) {
		return cmp * Number.POSITIVE_INFINITY;
	}

	return a.localId - b.localId;
}

/**
 * Compares two {@link RevisionTag}s to form a strict total ordering.
 * @remarks This function tolerates arbitrary strings, not just the string "root".
 * It sorts as follows: `undefined` \< `string` \< `number`
 */
export function comparePartialRevisions(
	a: RevisionTag | undefined,
	b: RevisionTag | undefined,
): number {
	if (typeof a === "number") {
		return typeof b === "number" ? a - b : 1;
	} else if (typeof b === "number") {
		return -1;
	}

	return comparePartialStrings(a, b);
}
