/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { isStableId, StableId } from "@fluidframework/id-compressor";
import { Brand, NestedMap, RangeMap, brandedStringType, generateStableId } from "../../util";

/**
 * The identifier for a particular session/user/client that can generate `GraphCommit`s
 */
export type SessionId = string;
export const SessionIdSchema = brandedStringType<SessionId>();

/**
 * A unique identifier for a commit. Commits that have been rebased, but are semantically
 * the same, will share the same revision tag.
 * @alpha
 */
// TODO: These can be compressed by an `IdCompressor` in the future
export type RevisionTag = StableId;
export type EncodedRevisionTag = Brand<string, "EncodedRevisionTag">;
export const RevisionTagSchema = brandedStringType<EncodedRevisionTag>();

/**
 * An ID which is unique within a revision of a `ModularChangeset`.
 * A `ModularChangeset` which is a composition of multiple revisions may contain duplicate `ChangesetLocalId`s,
 * but they are unique when qualified by the revision of the change they are used in.
 * @alpha
 */
export type ChangesetLocalId = Brand<number, "ChangesetLocalId">;

/**
 * A globally unique ID for an atom of change, or a node associated with the atom of change.
 * @alpha
 *
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

export interface EncodedChangeAtomId {
	readonly revision?: EncodedRevisionTag;
	readonly localId: ChangesetLocalId;
}

/**
 * @alpha
 */
export type ChangeAtomIdMap<T> = NestedMap<RevisionTag | undefined, ChangesetLocalId, T>;

/**
 * @alpha
 */
export type ChangeAtomIdRangeMap<T> = Map<RevisionTag | undefined, RangeMap<T>>;

/**
 * @returns true iff `a` and `b` are the same.
 */
export function areEqualChangeAtomIds(a: ChangeAtomId, b: ChangeAtomId): boolean {
	return a.localId === b.localId && a.revision === b.revision;
}

/**
 * @returns a `RevisionTag` from the given string, or fails if the string is not a valid `RevisionTag`
 */
export function assertIsRevisionTag(revision: string): RevisionTag {
	assert(isRevisionTag(revision), 0x577 /* Expected revision to be valid RevisionTag */);
	return revision;
}

/**
 * @returns true iff the given string is a valid `RevisionTag`
 */
export function isRevisionTag(revision: string): revision is RevisionTag {
	return isStableId(revision);
}

/**
 * @returns a random, universally unique `RevisionTag`
 */
export function mintRevisionTag(): RevisionTag {
	return generateStableId();
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
	/** The inverse of this commit */
	inverse?: TChange;
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
