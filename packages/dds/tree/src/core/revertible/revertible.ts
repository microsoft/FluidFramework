/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Allows reversion of a change made to SharedTree.
 *
 * Applications wanting to implement undo/redo support might typically maintain two stacks of Revertibles, with optional eviction policy to free up memory.
 * @internal
 */
export interface Revertible {
	/**
	 * The current status of the revertible.
	 */
	readonly status: RevertibleStatus;
	/**
	 * Reverts the associated change.
	 */
	revert(): void;
	/**
	 * Decrements the reference count of the revertible.
	 */
	release(): void;
}

/**
 * The type of commit.
 * todo: move this somewhere that makes more sense
 *
 * @internal
 */
export enum CommitKind {
	/** A typical local commit */
	Default,
	/** A revertible that is the result of an undo. */
	Undo,
	/** A revertible that is the result of a redo. */
	Redo,
	/**
	 * A revertible that is the result of a rebase and should replace a previously generated revertible.
	 * todo: improve error reporting in this case
	 */
	Rebase,
}

/**
 * The status of a {@link Revertible}.
 *
 * @internal
 */
export enum RevertibleStatus {
	/** The revertible can be reverted. */
	Valid,
	/** The revertible has been disposed. Reverting it will have no effect. */
	Disposed,
}

/**
 * todoj move this somewhere that makes sense and figure out what release tag to use
 *
 * @internal
 */
export interface CommitMetadata {
	/**
	 * A {@link CommitKind} enum value describing whether the commit represents an Edit, an Undo, or a Redo.
	 */
	kind: CommitKind;
	/**
	 * Indicates whether the commit is a local edit
	 */
	isLocal: boolean;
}
