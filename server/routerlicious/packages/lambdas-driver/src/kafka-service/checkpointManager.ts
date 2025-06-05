/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { Deferred } from "@fluidframework/common-utils";
import { IConsumer, IQueuedMessage } from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

export class CheckpointManager {
	private checkpointing = false;
	private closed = false;
	private commitedCheckpoint: IQueuedMessage | undefined;
	private lastCheckpoint: IQueuedMessage | undefined;
	private pendingCheckpoint: Deferred<void> | undefined;
	private error: any;

	constructor(
		private readonly id: number,
		private readonly consumer: IConsumer,
	) {}

	/**
	 * Requests a checkpoint at the given offset
	 */
	public async checkpoint(queuedMessage: IQueuedMessage) {
		// Checkpoint calls should always be of increasing or equal value
		// Exit early if already requested checkpoint for a higher offset
		if (this.lastCheckpoint && queuedMessage.offset < this.lastCheckpoint.offset) {
			Lumberjack.info(
				"Skipping checkpoint since a request for checkpointing a higher offset has already been made",
				{
					lastCheckpointOffset: this.lastCheckpoint.offset,
					queuedMessageOffset: queuedMessage.offset,
					lastCheckpointPartition: this.lastCheckpoint.partition,
					queuedMessagePartition: queuedMessage.partition,
				},
			);
			return;
		}

		// Exit early if the manager has been closed
		if (this.closed) {
			return;
		}

		// No recovery once entering an error state
		if (this.error) {
			throw this.error;
		}

		// Exit early if already caught up
		if (this.commitedCheckpoint === queuedMessage) {
			return;
		}

		// Track the highest requested offset
		this.lastCheckpoint = queuedMessage;

		// If already checkpointing allow the operation to complete to trigger another round.
		if (this.checkpointing) {
			// Create a promise that will resolve to the next checkpoint that will include the requested offset
			// and then return this as the result of checkpoint
			if (!this.pendingCheckpoint) {
				this.pendingCheckpoint = new Deferred<void>();
			}
			return this.pendingCheckpoint.promise;
		}

		// Finally begin checkpointing the offsets.
		this.checkpointing = true;

		return this.consumer
			.commitCheckpoint(this.id, queuedMessage)
			.then(() => {
				this.commitedCheckpoint = queuedMessage;
				this.checkpointing = false;

				// Trigger another checkpoint round if the offset has moved since the checkpoint finished and
				// resolve any pending checkpoints to it.
				if (this.lastCheckpoint && this.lastCheckpoint !== this.commitedCheckpoint) {
					assert(
						this.pendingCheckpoint,
						"Differing offsets will always result in pendingCheckpoint",
					);
					const nextCheckpointP = this.checkpoint(this.lastCheckpoint);
					this.pendingCheckpoint.resolve(nextCheckpointP);
					this.pendingCheckpoint = undefined;
				} else if (this.pendingCheckpoint) {
					this.pendingCheckpoint.resolve();
					this.pendingCheckpoint = undefined;
				}
			})
			.catch((error) => {
				if (
					error.name === "PendingCommitError" ||
					this.consumer
						.getIgnoreAndSkipCheckpointOnKafkaErrorCodes?.()
						?.includes(error.code)
				) {
					Lumberjack.info(`Skipping checkpoint for the error`, {
						queuedMessageOffset: queuedMessage.offset,
						queuedMessagePartition: queuedMessage.partition,
						error,
					});
					this.checkpointing = false;
					return;
				}
				// Enter an error state on any other commit error
				this.error = error;
				if (this.pendingCheckpoint) {
					this.pendingCheckpoint.reject(this.error);
				}
				throw error;
			});
	}

	/**
	 * Checkpoints at the last received offset.
	 */
	public async flush(): Promise<void> {
		if (this.lastCheckpoint) {
			Lumberjack.info(`Checkpointing last recieved offset: ${this.lastCheckpoint.offset}`, {
				offset: this.lastCheckpoint.offset,
				partition: this.lastCheckpoint.partition,
			});
			return this.checkpoint(this.lastCheckpoint);
		}
	}

	/**
	 * Closes the checkpoint manager - this will stop it from performing any future checkpoints
	 */
	public close(): void {
		this.closed = true;
	}
}
