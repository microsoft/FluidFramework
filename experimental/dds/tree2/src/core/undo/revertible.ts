/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface Revertible {
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
