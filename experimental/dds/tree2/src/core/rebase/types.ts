/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { isStableId } from "@fluidframework/container-runtime";
import { StableId } from "@fluidframework/runtime-definitions";
import { brandedStringType, generateStableId } from "../../util";

/**
 * The identifier for a particular session/user/client that can generate `GraphCommit`s
 */
export type SessionId = string;

/**
 * A unique identifier for a commit. Commits that have been rebased, but are semantically
 * the same, will share the same revision tag.
 * @alpha
 */
// TODO: These can be compressed by an `IdCompressor` in the future
export type RevisionTag = StableId;
export const RevisionTagSchema = brandedStringType<StableId>();

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
