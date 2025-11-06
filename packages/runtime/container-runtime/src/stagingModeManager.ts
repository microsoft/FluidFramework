/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ICriticalContainerError } from "@fluidframework/container-definitions/internal";
import {
	DataProcessingError,
	LoggingError,
	UsageError,
	normalizeError,
	wrapError,
} from "@fluidframework/telemetry-utils/internal";
import type {
	StageCheckpointAlpha,
	StageControlsInternal,
} from "@fluidframework/runtime-definitions/internal";
import { DoublyLinkedList } from "@fluidframework/core-utils/internal";
import type { PendingStateManager } from "./pendingStateManager.js";
import { getEffectiveBatchId, type Outbox } from "./opLifecycle/index.js";
import type { ChannelCollection } from "./channelCollection.js";
import type { LocalContainerRuntimeMessage } from "./messageTypes.js";

/**
 * Default options for committing staged changes.
 */
const defaultStagingCommitOptions = {
	squash: false,
} as const;

/**
 * Dependencies needed by the StagingModeManager to operate.
 * Uses Pick to extract only the methods we actually need, making testing easier.
 */
export interface StagingModeDependencies {
	readonly pendingStateManager: Pick<
		PendingStateManager,
		"popStagedBatches" | "replayPendingStates" | "getLastPendingMessage"
	>;
	readonly outbox: Pick<Outbox, "flush" | "mainBatchMessageCount">;
	readonly channelCollection: Pick<ChannelCollection, "notifyStagingMode">;
	readonly submitIdAllocationOpIfNeeded: (options: { staged: boolean }) => void;
	readonly rollbackStagedChange: (
		runtimeOp: LocalContainerRuntimeMessage,
		localOpMetadata: unknown,
	) => void;
	readonly updateDocumentDirtyState: () => void;
	readonly closeFn: (error?: ICriticalContainerError) => void;
}

/**
 * Manages staging mode state and checkpoint creation for the ContainerRuntime.
 * Staging mode allows ops to be queued locally before being committed or discarded.
 */
export class StagingModeManager {
	private stageControls: StageControlsInternal | undefined;

	constructor(private readonly dependencies: StagingModeDependencies) {}

	/**
	 * Whether the container is currently in staging mode.
	 */
	public get inStagingMode(): boolean {
		return this.stageControls !== undefined;
	}

	/**
	 * Enter staging mode, queuing ops locally instead of sending to the ordering service.
	 *
	 * @param flushFn - Function to flush the outbox before entering staging mode
	 * @returns Controls for managing staged changes
	 * @throws UsageError if already in staging mode
	 */
	public enterStagingMode(flushFn: () => void): StageControlsInternal {
		if (this.stageControls !== undefined) {
			throw new UsageError("Already in staging mode");
		}

		// Make sure Outbox is empty before entering staging mode
		flushFn();

		// Track checkpoints for rollback support
		// Each checkpoint stores the batch ID of the last batch at that point
		const checkpointList = new DoublyLinkedList<string | undefined>();

		const exitStagingMode = (discardOrCommit: () => void): void => {
			try {
				// Final flush of any last staged changes
				this.dependencies.outbox.flush();

				this.stageControls = undefined;

				// Invalidate all remaining checkpoints by removing them from the list
				while (checkpointList.first !== undefined) {
					checkpointList.first.remove();
				}

				// Submit any ID allocation ops that were deferred during staging mode
				this.dependencies.submitIdAllocationOpIfNeeded({ staged: false });
				discardOrCommit();

				this.dependencies.channelCollection.notifyStagingMode(false);
			} catch (error) {
				const normalizedError = normalizeError(error);
				this.dependencies.closeFn(normalizedError);
				throw normalizedError;
			}
		};

		const stageControls: StageControlsInternal = {
			discardChanges: () =>
				exitStagingMode(() => {
					// Pop all staged batches from the PSM and roll them back in LIFO order
					this.dependencies.pendingStateManager.popStagedBatches(
						({ runtimeOp, localOpMetadata }) => {
							this.dependencies.rollbackStagedChange(runtimeOp, localOpMetadata);
						},
					);
					this.dependencies.updateDocumentDirtyState();
				}),
			commitChanges: (options) => {
				const { squash } = { ...defaultStagingCommitOptions, ...options };
				exitStagingMode(() => {
					// Replay all staged batches in typical FIFO order
					this.dependencies.pendingStateManager.replayPendingStates({
						committingStagedBatches: true,
						squash,
					});
				});
			},
			checkpoint: () => {
				// Flush outbox to ensure all messages are in PSM
				this.dependencies.outbox.flush();

				// Get reference to the last pending message (or undefined if none)
				const lastMessage = this.dependencies.pendingStateManager.getLastPendingMessage();

				return this.createCheckpoint(
					checkpointList,
					lastMessage?.batchInfo.staged === true
						? getEffectiveBatchId(lastMessage)
						: undefined,
				);
			},
		};

		this.stageControls = stageControls;
		this.dependencies.channelCollection.notifyStagingMode(true);

		return this.stageControls;
	}

	/**
	 * Create a checkpoint that can be rolled back to later.
	 *
	 * @param checkpointList - List tracking all active checkpoints
	 * @param batchId - Batch ID of the last batch at checkpoint time (or undefined if no messages yet)
	 * @returns Checkpoint object with rollback and dispose capabilities
	 */
	private createCheckpoint(
		checkpointList: DoublyLinkedList<string | undefined>,
		batchId: string | undefined,
	): StageCheckpointAlpha {
		// Add checkpoint to the list and store the node
		// We store the batch ID of the last batch at this checkpoint
		const { last: checkpointNode } = checkpointList.push(batchId);

		// Capture dependencies for use in checkpoint methods
		const deps = this.dependencies;

		// Create the checkpoint object
		const checkpoint: StageCheckpointAlpha = {
			rollback: () => {
				// Check if this checkpoint is still in the list
				if (checkpointNode.list === undefined) {
					throw new LoggingError("Cannot rollback an invalid checkpoint");
				}

				// Invalidate all checkpoints created after this one
				while (checkpointNode.next !== undefined) {
					checkpointNode.next.remove();
				}

				// Remove this checkpoint itself
				checkpointNode.remove();

				try {
					// Flush the outbox to ensure all messages are in PSM before rolling back
					deps.outbox.flush();

					// Rollback all messages added after the checkpoint batch ID
					// This uses batch ID comparison - stable across resubmit!
					deps.pendingStateManager.popStagedBatches(({ runtimeOp, localOpMetadata }) => {
						deps.rollbackStagedChange(runtimeOp, localOpMetadata);
					}, batchId);

					deps.updateDocumentDirtyState();
				} catch (error) {
					const error2 = wrapError(error, (message) => {
						return DataProcessingError.create(
							`RollbackError: ${message}`,
							"checkpointRollback",
							undefined,
						) as DataProcessingError;
					});
					deps.closeFn(error2);
					throw error2;
				}
			},
			dispose: () => {
				// Check if this checkpoint is still in the list
				if (checkpointNode.list === undefined) {
					throw new LoggingError("Cannot dispose an invalid checkpoint");
				}
				// Remove only this checkpoint from the list
				// Other checkpoints (before and after) remain valid
				checkpointNode.remove();
			},
			get isValid(): boolean {
				// Checkpoint is valid if it's still in the list
				return checkpointNode.list !== undefined;
			},
			get hasChangesSince(): boolean {
				// Check if there are unflushed messages in the outbox
				if (deps.outbox.mainBatchMessageCount !== 0) {
					return true;
				}

				// Check if any messages have been added since the checkpoint
				// by comparing the current last batch ID with the checkpoint's batch ID
				const currentLastMessage = deps.pendingStateManager.getLastPendingMessage();
				const currentLastBatchId =
					currentLastMessage?.batchInfo.staged === true
						? getEffectiveBatchId(currentLastMessage)
						: undefined;
				return currentLastBatchId !== batchId;
			},
		};

		return checkpoint;
	}
}
