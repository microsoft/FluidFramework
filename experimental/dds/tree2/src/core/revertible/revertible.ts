/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Allows reversion of a change made to SharedTree.
 *
 * Applications wanting to implement undo/redo support might typically maintain two stacks of Revertibles, with optional eviction policy to free up memory.
 * @beta
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
	 * Can be called in order to revert a change. A successful revert will automatically discard resources.
	 */
	revert(): RevertResult;
	/**
	 * Should be called to garbage collect any resources associated with the revertible.
	 */
	discard(): DiscardResult;
}

/**
 * The type of revertible commit.
 *
 * @beta
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
 * The result of a revert operation.
 *
 * @beta
 */
export enum RevertResult {
	/** The revert was successful. */
	Success,
	/** The revert failed. */
	Failure,
}

/**
 * The result of a discard operation.
 *
 * @beta
 */
export enum DiscardResult {
	/** The discard was successful. */
	Success,
	/** The discard failed. */
	Failure,
}
