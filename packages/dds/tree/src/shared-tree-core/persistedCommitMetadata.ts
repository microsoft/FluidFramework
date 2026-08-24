/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RevisionTag } from "../core/index.js";
import type { JsonCompatibleReadOnlyObject } from "../util/index.js";

/**
 * Application-defined, JSON-serializable metadata attached to a commit and persisted in the document.
 * @remarks
 * This is distinct from `CommitMetadata`, which describes a commit's `kind` and `isLocal` flags and never leaves memory.
 */
export type PersistedCommitMetadata = JsonCompatibleReadOnlyObject;

/**
 * An in-memory map from {@link RevisionTag} to the {@link PersistedCommitMetadata} attached to that revision's commit.
 *
 * @remarks
 * The index is deliberately keyed by revision rather than stored on the `GraphCommit` object itself:
 * `rebaseBranch` constructs rebased commits as fresh object literals (with no spread), so any extra property
 * on a commit is dropped the first time that commit is rebased. Revision tags, by contrast, are stable across
 * rebase and merge, so a lookup by revision remains valid wherever a commit ends up.
 *
 * A single index is held by the `SharedTreeCore` and shared by every checkout of that tree, so that metadata
 * recorded by a transaction on a fork is found when the merge of that fork submits the commit.
 */
export class PersistedCommitMetadataIndex {
	readonly #metadata = new Map<RevisionTag, PersistedCommitMetadata>();

	/**
	 * Records the metadata for the given revision.
	 */
	public set(revision: RevisionTag, metadata: PersistedCommitMetadata): void {
		this.#metadata.set(revision, metadata);
	}

	/**
	 * Returns the metadata for the given revision, or `undefined` if the revision was never annotated,
	 * predates this feature, or has been evicted.
	 */
	public get(revision: RevisionTag): PersistedCommitMetadata | undefined {
		return this.#metadata.get(revision);
	}

	/**
	 * Removes the metadata for the given revision, if any.
	 */
	public delete(revision: RevisionTag): void {
		this.#metadata.delete(revision);
	}

	/**
	 * Removes the metadata for all of the given revisions, if any.
	 */
	public deleteAll(revisions: readonly RevisionTag[]): void {
		for (const revision of revisions) {
			this.#metadata.delete(revision);
		}
	}

	/**
	 * The number of revisions currently tracked by this index.
	 * @remarks Exposed for testing purposes.
	 */
	public get size(): number {
		return this.#metadata.size;
	}
}
