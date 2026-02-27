/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	OpSpaceCompressedId,
	SessionId,
	SessionSpaceCompressedId,
	StableId,
} from "@fluidframework/id-compressor";
import { Type } from "@sinclair/typebox";

import {
	type Brand,
	type JsonCompatibleReadOnly,
	type ValueTree,
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
	 * A set of {@link RunTransactionParams.label | labels} for all transactions (nested or otherwise)
	 * that made up this change.
	 * This can be used to identify, group, or filter changes — for example, to decide whether a change
	 * should be included in an undo/redo stack.
	 *
	 * @remarks
	 * The set contains all label values from the transaction tree. Use standard `Set` methods
	 * like {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/has | has}
	 * to check for specific labels.
	 *
	 * The optional {@link ValueTree | tree} property provides the structural nesting of the transactions.
	 * Each transaction contributes a node whose {@link ValueTree.value} is its label
	 * (or `undefined` if no label was provided).
	 * When transactions are nested, inner transaction nodes become children of outer ones.
	 *
	 * The `tree` property is present whenever the change was produced by a transaction that
	 * includes at least one defined (non-`undefined`) label. If all transactions are unlabeled,
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
	 * //   { value: "outer", children: [{ value: "inner", children: [] }] }
	 * ```
	 */
	readonly labels: TransactionLabels;
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
 * of the transactions as a {@link ValueTree}.
 *
 * @sealed @alpha
 */
export type TransactionLabels = Set<unknown> & { tree?: ValueTree };

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
