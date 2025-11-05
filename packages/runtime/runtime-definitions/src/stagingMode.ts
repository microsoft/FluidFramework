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
 * Controls for managing staged changes in staging mode.
 *
 * Staging mode lets you make changes locally before committing or discarding them.
 * You can also create checkpoints and rollback to them.
 *
 * @example Stateful editor with async validation
 * ```typescript
 * class DraftFormEditor {
 *   private controls = this.runtime.enterStagingMode();
 *
 *   async updateField(name: string, value: string) {
 *     this.map.set(name, value);
 *
 *     if (this.controls.hasChangesSinceCheckpoint) {
 *       this.controls.checkpoint();
 *     }
 *
 *     try {
 *       await this.validateWithServer(name, value);
 *     } catch (error) {
 *       if (this.controls.hasChangesSinceCheckpoint) {
 *         this.controls.rollbackToCheckpoint();
 *       }
 *       throw error;
 *     }
 *   }
 *
 *   undo() {
 *     if (this.controls.hasChangesSinceCheckpoint) {
 *       this.controls.rollbackToCheckpoint();
 *     }
 *   }
 *
 *   save() {
 *     this.controls.commitChanges();
 *   }
 *
 *   dispose() {
 *     this.controls.discardChanges();
 *   }
 * }
 * ```
 *
 * @legacy @alpha
 * @sealed
 */
export interface StageControlsAlpha {
	/**
	 * Exit staging mode and send all changes to the service.
	 */
	readonly commitChanges: () => void;

	/**
	 * Exit staging mode and undo all changes.
	 */
	readonly discardChanges: () => void;

	/**
	 * Create a checkpoint you can rollback to later.
	 *
	 * Use this to mark save points so you can undo back to them with  rollbackToCheckpoint.
	 * Empty checkpoints (no changes since last checkpoint) are automatically skipped.
	 *
	 * @example
	 * ```typescript
	 * async updateField(name: string, value: string) {
	 *   this.map.set(name, value);
	 *
	 *   if (this.controls.hasChangesSinceCheckpoint) {
	 *     this.controls.checkpoint(); // Save after each field
	 *   }
	 *
	 *   try {
	 *     await this.validateWithServer(name, value);
	 *   } catch (error) {
	 *     if (this.controls.hasChangesSinceCheckpoint) {
	 *       this.controls.rollbackToCheckpoint();
	 *     }
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */
	readonly checkpoint: () => void;

	/**
	 * Whether any changes have been made since the last checkpoint (or since entering staging mode).
	 *
	 * Use this to check if checkpoint or rollbackToCheckpoint will have an effect.
	 *
	 */
	readonly hasChangesSinceCheckpoint: boolean;

	/**
	 * Undo all changes back to the most recent checkpoint.
	 *
	 * The checkpoint is removed after rollback. Always check hasChangesSinceCheckpoint first.
	 *
	 * @throws Error if no checkpoint exists.
	 *
	 * @example
	 * ```typescript
	 * if (controls.hasChangesSinceCheckpoint) {
	 *   controls.rollbackToCheckpoint();
	 * }
	 * ```
	 */
	readonly rollbackToCheckpoint: () => void;
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
 * Alpha interface for container runtime with staging mode support.
 *
 * @legacy @alpha
 * @sealed
 */
export interface ContainerRuntimeBaseAlpha extends IContainerRuntimeBase {
	/**
	 * Enter staging mode to queue changes locally before committing or discarding them.
	 *
	 * @returns Controls for managing staged changes. See {@link StageControlsAlpha}.
	 *
	 * @example
	 * ```typescript
	 * class DraftFormEditor {
	 *   private controls = this.runtime.enterStagingMode();
	 *
	 *   async updateField(name: string, value: string) {
	 *     this.map.set(name, value);
	 *
	 *     if (this.controls.hasChangesSinceCheckpoint) {
	 *       this.controls.checkpoint();
	 *     }
	 *
	 *     try {
	 *       await this.validateWithServer(name, value);
	 *     } catch (error) {
	 *       if (this.controls.hasChangesSinceCheckpoint) {
	 *         this.controls.rollbackToCheckpoint();
	 *       }
	 *       throw error;
	 *     }
	 *   }
	 *
	 *   undo() {
	 *     if (this.controls.hasChangesSinceCheckpoint) {
	 *       this.controls.rollbackToCheckpoint();
	 *     }
	 *   }
	 *
	 *   save() {
	 *     this.controls.commitChanges();
	 *   }
	 *
	 *   dispose() {
	 *     this.controls.discardChanges();
	 *   }
	 * }
	 * ```
	 */
	enterStagingMode(): StageControlsAlpha;

	/**
	 * Whether the container is currently in staging mode.
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
