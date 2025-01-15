/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	OpSpaceCompressedId,
	SessionId,
	SessionSpaceCompressedId,
} from "@fluidframework/id-compressor";
import { Type } from "@sinclair/typebox";

import {
	type Brand,
	type NestedMap,
	RangeMap,
	brand,
	brandedNumberType,
	brandedStringType,
} from "../../util/index.js";

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

/**
 * An ID which is unique within a revision of a `ModularChangeset`.
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

/**
 */
export type ChangeAtomIdMap<T> = NestedMap<RevisionTag | undefined, ChangesetLocalId, T>;

/**
 * @returns true iff `a` and `b` are the same.
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
 * @returns a ChangeAtomId with the given revision and local ID.
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

export function offsetChangeAtomId(id: ChangeAtomId, offset: number): ChangeAtomId {
	return { ...id, localId: brand(id.localId + offset) };
}

export function replaceAtomRevisions(
	id: ChangeAtomId,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): ChangeAtomId {
	return oldRevisions.has(id.revision) ? atomWithRevision(id, newRevision) : id;
}

function atomWithRevision(id: ChangeAtomId, revision: RevisionTag | undefined): ChangeAtomId {
	const updated = { ...id, revision };
	if (revision === undefined) {
		delete updated.revision;
	}

	return updated;
}

/**
 * A node in a graph of commits. A commit's parent is the commit on which it was based.
 */
export interface GraphCommit<TChange> {
	/** The tag for this commit. If this commit is rebased, the corresponding rebased commit will retain this tag. */
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

export function newChangeAtomIdRangeMap<V>(): ChangeAtomIdRangeMap<V> {
	return new RangeMap(offsetChangeAtomId, subtractChangeAtomIds);
}

function subtractChangeAtomIds(a: ChangeAtomId, b: ChangeAtomId): number {
	const cmp = compareRevisions(a.revision, b.revision);
	if (cmp !== 0) {
		return cmp * Number.POSITIVE_INFINITY;
	}

	return a.localId - b.localId;
}

export function compareRevisions(
	a: RevisionTag | undefined,
	b: RevisionTag | undefined,
): number {
	if (a === undefined) {
		return b === undefined ? 0 : -1;
	} else if (b === undefined) {
		return 1;
	} else if (a < b) {
		return -1;
	} else if (a > b) {
		return 1;
	}

	return 0;
}
