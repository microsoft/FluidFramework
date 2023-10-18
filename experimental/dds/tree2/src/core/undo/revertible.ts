/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Can be called in order to revert a change. Discard should be called to garbage collect
 * any resources associated with the revertible.
 *
 * @alpha
 */
export interface Revertible {
	/** Indicates the type of edit that produced this revertible. */
	readonly kind: RevertibleKind;
	readonly origin: {
		readonly isLocal: boolean;
	};
	revert(): RevertResult;
	discard(): DiscardResult;
}

/**
 * The type of revertible commit.
 *
 * @alpha
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
 * @alpha
 */
export enum RevertResult {
	Success,
	Failure,
}

/**
 * The result of a revert operation.
 *
 * @alpha
 */
export enum DiscardResult {
	Success,
	Failure,
}
