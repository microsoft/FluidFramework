/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICheckpointService, IContext, IDeliState } from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { CheckpointReason } from "../utils";
import { ICheckpointParams, IDeliCheckpointManager } from "./checkpointManager";

export class CheckpointContext {
	private pendingUpdateP: Promise<void> | undefined;
	private pendingCheckpoint: ICheckpointParams | undefined;
	private closed = false;
	private lastKafkaCheckpointOffset: number | undefined;

	constructor(
		private readonly tenantId: string,
		private readonly id: string,
		private readonly checkpointManager: IDeliCheckpointManager,
		private readonly context: IContext,
		private readonly checkpointService: ICheckpointService | undefined,
	) {}

	/**
	 * Checkpoints to the database & kafka
	 * Note: This is an async method, but you should not await this
	 */
	public async checkpoint(
		checkpoint: ICheckpointParams,
		restartOnCheckpointFailure?: boolean,
		globalCheckpointOnly?: boolean,
	): Promise<void> {
		// Exit early if already closed
		if (this.closed) {
			return;
		}

		// Check if a checkpoint is in progress - if so store the pending checkpoint
		if (this.pendingUpdateP) {
			this.pendingCheckpoint = checkpoint;
			return;
		}

		let databaseCheckpointFailed = false;
		const lumberjackProperties = {
			...getLumberBaseProperties(this.id, this.tenantId),
		};

		// Database checkpoint
		try {
			this.pendingUpdateP = this.checkpointCore(checkpoint, globalCheckpointOnly);
			await this.pendingUpdateP;
		} catch (error) {
			// TODO flag context as error / use this.context.error() instead?
			this.context.log?.error(
				`Error writing checkpoint to the database: ${JSON.stringify(error)}, ${error}`,
				{
					messageMetaData: {
						documentId: this.id,
						tenantId: this.tenantId,
					},
				},
			);
			Lumberjack.error(
				`Error writing checkpoint to the database`,
				lumberjackProperties,
				error,
			);
			databaseCheckpointFailed = true;
		}

		// We write a kafka checkpoint if either the local or global checkpoint succeeds
		// databaseCheckpointFailed is true only if both local and global checkpoint fail
		if (databaseCheckpointFailed) {
			Lumberjack.info(
				`Skipping kafka checkpoint due to database checkpoint failure.`,
				lumberjackProperties,
			);
			databaseCheckpointFailed = false;
		} else {
			// Kafka checkpoint
			try {
				// depending on the sequence of events, it might try to checkpoint the same offset a second time
				// detect and prevent that case here
				const kafkaCheckpointMessage = checkpoint.kafkaCheckpointMessage;
				if (
					kafkaCheckpointMessage &&
					(this.lastKafkaCheckpointOffset === undefined ||
						kafkaCheckpointMessage.offset > this.lastKafkaCheckpointOffset)
				) {
					this.lastKafkaCheckpointOffset = kafkaCheckpointMessage.offset;
					this.context.checkpoint(kafkaCheckpointMessage, restartOnCheckpointFailure);
				}
			} catch (error) {
				// TODO flag context as error / use this.context.error() instead?
				this.context.log?.error(
					`Error writing checkpoint to kafka: ${JSON.stringify(error)}`,
					{
						messageMetaData: {
							documentId: this.id,
							tenantId: this.tenantId,
						},
					},
				);
				Lumberjack.error(
					`Error writing checkpoint to the kafka`,
					lumberjackProperties,
					error,
				);
			}
		}
		this.pendingUpdateP = undefined;

		// Trigger another round if there is a pending update
		if (this.pendingCheckpoint) {
			const pendingCheckpoint = this.pendingCheckpoint;
			this.pendingCheckpoint = undefined;
			this.checkpoint(pendingCheckpoint).catch((error) => {
				Lumberjack.error("Error writing checkpoint", lumberjackProperties, error);
			});
		}
	}

	public close(): void {
		this.closed = true;
	}

	private async checkpointCore(
		checkpoint: ICheckpointParams,
		globalCheckpointOnly: boolean = false,
	): Promise<void> {
		// Exit early if already closed
		if (this.closed) {
			return;
		}

		let updateP: Promise<void>;

		const localCheckpointEnabled = this.checkpointService?.getLocalCheckpointEnabled();

		// determine if checkpoint is local
		const isLocal =
			globalCheckpointOnly === true
				? false
				: localCheckpointEnabled === true &&
				  checkpoint.reason !== CheckpointReason.NoClients;

		if (checkpoint.clear) {
			updateP = this.checkpointManager.deleteCheckpoint(checkpoint, isLocal);
		} else {
			// clone the checkpoint
			const deliCheckpoint: IDeliState = { ...checkpoint.deliState };
			updateP = this.checkpointManager.writeCheckpoint(
				deliCheckpoint,
				isLocal,
				checkpoint.reason,
			);
		}

		return updateP.catch((error) => {
			this.context.log?.error(
				`Error writing checkpoint to MongoDB: ${JSON.stringify(error)}`,
				{
					messageMetaData: {
						documentId: this.id,
						tenantId: this.tenantId,
					},
				},
			);
			Lumberjack.error(
				`Error writing checkpoint to MongoDB`,
				getLumberBaseProperties(this.id, this.tenantId),
				error,
			);
			throw error;
		});
	}
}
