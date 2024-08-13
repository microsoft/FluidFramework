/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Allows reversion of a change made to SharedTree.
 *
 * @remarks
 * Applications wanting to implement undo/redo support might typically maintain two stacks of Revertibles, with optional eviction policy to free up memory.
 *
 * @sealed @public
 */
export interface Revertible {
	/**
	 * The current status of the revertible.
	 */
	readonly status: RevertibleStatus;

	/**
	 * Reverts the associated change and disposes it.
	 */
	revert(): void;
	/**
	 * Reverts the associated change and optionally disposes it.
	 *
	 * @param dispose - If true, the revertible will be disposed after being reverted.
	 * If false, the revertible will remain valid. This can be useful for scenarios where the revert may be dropped
	 * due to merge conflicts, and one wants to attempt reverting again.
	 */
	revert(dispose: boolean): void;

	/**
	 * Disposes this revertible, allowing associated resources to be released.
	 */
	dispose(): void;
}

/**
 * The status of a {@link Revertible}.
 *
 * @public
 */
export enum RevertibleStatus {
	/** The revertible can be reverted. */
	Valid,
	/** The revertible has been disposed. Reverting it will have no effect. */
	Disposed,
}
