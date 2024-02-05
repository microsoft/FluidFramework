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
	/** Indicates the type of edit that produced this revertible. */
	readonly kind: RevertibleKind;
	/**
	 * Information about which client created the edit.
	 */
	readonly origin: {
		/**
		 * Indicates if the {@link Revertible} is from the local client (true) or a remote client (false).
		 */
		readonly isLocal: boolean;
	};
	/**
	 * The current status of the revertible.
	 */
	readonly status: RevertibleStatus;
	/**
	 * Reverts the associated change and decrements the reference count of the revertible.
	 */
	revert(): RevertibleResult;
	/**
	 * Increments the reference count of the revertible.
	 * Should be called to prevent/delay the garbage collection of the resources associated with this revertible.
	 */
	retain(): RevertibleResult;
	/**
	 * Decrements the reference count of the revertible.
	 */
	discard(): RevertibleResult;
}

/**
 * The type of revertible commit.
 *
 * @internal
 */
export enum RevertibleKind {
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
 * The result of a revert operation.
 *
 * @internal
 */
export enum RevertibleResult {
	/** The operation was successful. */
	Success,
	/** The operation failed. This occurs when attempting an operation on a disposed revertible */
	Failure,
}
