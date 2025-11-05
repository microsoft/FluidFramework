/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntimeBase } from "./dataStoreContext.js";

/**
 * Options for committing staged changes in experimental staging mode.
 * @internal
 */
export interface CommitStagedChangesOptionsInternal {
	/**
	 * If true, intermediate states created by changes made while in staging mode will be "squashed" out of the
	 * ops which were created during staging mode.
	 * Defaults to false.
	 * @remarks
	 * The squash parameter is analogous to `git squash` but differs in a notable way: ops created by a client exiting staging mode
	 * are not necessarily coalesced into a single op or something like it.
	 * It still does have the desirable property that "unnecessary changes" (such as inserting some content then removing it) will
	 * be removed from the set of submitted ops, which means it helps reduce network traffic and the chance of unwanted data being
	 * persisted--even if only temporarily--in the document.
	 *
	 * By not attempting to reduce the set of changes to a single op a la `git squash`, we can better preserve the ordering of
	 * changes that remote clients see such that they better align with the client which submitted the changes.
	 */
	squash?: boolean;
}

/**
 * Controls for managing staged changes in experimental staging mode.
 *
 * Provides methods to either commit or discard changes made while in staging mode.
 * @internal
 */
export interface StageControlsInternal extends StageControlsAlpha {
	/**
	 * Exit staging mode and commit to any changes made while in staging mode.
	 * This will cause them to be sent to the ordering service, and subsequent changes
	 * made by this container will additionally flow freely to the ordering service.
	 * @param options - Options when committing changes.
	 */
	readonly commitChanges: (options?: Partial<CommitStagedChangesOptionsInternal>) => void;
}

/**
 * Controls for managing staged changes in alpha staging mode.
 *
 * Provides methods to either commit or discard changes made while in staging mode.
 * Additionally supports creating checkpoints within staging mode for granular rollback control.
 *
 * @legacy @alpha
 * @sealed
 */
export interface StageControlsAlpha {
	/**
	 * Exit staging mode and commit to any changes made while in staging mode.
	 * This will cause them to be sent to the ordering service, and subsequent changes
	 * made by this container will additionally flow freely to the ordering service.
	 */
	readonly commitChanges: () => void;
	/**
	 * Exit staging mode and discard any changes made while in staging mode.
	 */
	readonly discardChanges: () => void;

	/**
	 * Creates a checkpoint at the current state within staging mode.
	 *
	 * Checkpoints allow you to mark specific points in your staged changes that you can
	 * selectively rollback to using {@link StageControlsAlpha.rollbackCheckpoint | rollbackCheckpoint()}.
	 * Checkpoints are managed as a stack (LIFO) - rolling back always affects the
	 * most recently created checkpoint.
	 *
	 * @remarks
	 * - Empty checkpoints (no messages since entering staging mode) are not created
	 * - Duplicate checkpoints (no new messages since last checkpoint) are not created
	 * - Checkpoints only track changes within the current staging session
	 * - All checkpoints are discarded when exiting staging mode via
	 * {@link StageControlsAlpha.commitChanges | commitChanges()} or
	 * {@link StageControlsAlpha.discardChanges | discardChanges()}
	 *
	 * @example
	 * ```typescript
	 * const controls = runtime.enterStagingMode();
	 *
	 * // Make some changes
	 * map.set("key1", "value1");
	 * controls.checkpoint(); // Checkpoint 1
	 *
	 * // Make more changes
	 * map.set("key2", "value2");
	 * controls.checkpoint(); // Checkpoint 2
	 *
	 * // Make even more changes
	 * map.set("key3", "value3");
	 *
	 * // Rollback to checkpoint 2 (discards key3)
	 * controls.rollbackCheckpoint();
	 *
	 * // Rollback to checkpoint 1 (discards key2)
	 * controls.rollbackCheckpoint();
	 *
	 * // Commit key1 to the service
	 * controls.commitChanges();
	 * ```
	 */
	readonly checkpoint: () => void;

	/**
	 * The number of active checkpoints in the checkpoint stack.
	 *
	 * @remarks
	 * Returns 0 when no checkpoints have been created or all have been rolled back.
	 */
	readonly checkpointCount: number;

	/**
	 * Rolls back all changes made since the most recent checkpoint and removes that checkpoint.
	 *
	 * This method operates on a stack (LIFO) - it always rolls back to the most recently
	 * created checkpoint. The checkpoint is removed from the stack after rollback.
	 *
	 * @remarks
	 * - If no checkpoints exist, this method does nothing (no-op)
	 * - Changes are rolled back in reverse order (LIFO)
	 * - The container remains in staging mode after rollback
	 * - Only changes made after the checkpoint are discarded; changes before the checkpoint remain
	 *
	 * @example
	 * ```typescript
	 * const controls = runtime.enterStagingMode();
	 *
	 * map.set("a", "1");
	 * controls.checkpoint();
	 *
	 * map.set("b", "2");
	 * map.set("c", "3");
	 *
	 * // Rollback sets for "b" and "c", keeps "a"
	 * controls.rollbackCheckpoint();
	 *
	 * controls.commitChanges(); // Only commits "a"
	 * ```
	 */
	readonly rollbackCheckpoint: () => void;
}

/**
 * Experimental extension of {@link IContainerRuntimeBase} to support staging mode.
 * @internal
 */
export interface IContainerRuntimeBaseInternal extends ContainerRuntimeBaseAlpha {
	/**
	 * Enters staging mode, allowing changes to be staged before being committed or discarded.
	 * @returns Controls for committing or discarding staged changes.
	 */
	enterStagingMode(): StageControlsInternal;
}

/**
 * Alpha interface for container runtime base supporting staging mode.
 *
 * @legacy @alpha
 * @sealed
 */
export interface ContainerRuntimeBaseAlpha extends IContainerRuntimeBase {
	/**
	 * Enters staging mode, allowing changes to be staged before being committed or discarded.
	 * @returns Controls for committing or discarding staged changes.
	 */
	enterStagingMode(): StageControlsAlpha;
	/**
	 * Indicates whether the container is currently in staging mode.
	 */
	readonly inStagingMode: boolean;
}

/**
 * Converts types to their alpha counterparts to expose alpha functionality.
 * @legacy @alpha
 * @sealed
 */
export function asLegacyAlpha(base: IContainerRuntimeBase): ContainerRuntimeBaseAlpha {
	return base as ContainerRuntimeBaseAlpha;
}
