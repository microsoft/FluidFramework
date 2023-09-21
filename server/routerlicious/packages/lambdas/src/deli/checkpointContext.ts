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
		private readonly checkpointService: ICheckpointService,
	) {}

	/**
	 * Checkpoints to the database & kafka
	 * Note: This is an async method, but you should not await this
	 */
	public async checkpoint(
		checkpoint: ICheckpointParams,
		restartOnCheckpointFailure?: boolean,
		globalCheckpointOnly?: boolean,
	) {
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
		} catch (ex) {
			// TODO flag context as error / use this.context.error() instead?
			this.context.log?.error(
				`Error writing checkpoint to the database: ${JSON.stringify(ex)}`,
				{
					messageMetaData: {
						documentId: this.id,
						tenantId: this.tenantId,
					},
				},
			);
			Lumberjack.error(`Error writing checkpoint to the database`, lumberjackProperties, ex);
			databaseCheckpointFailed = true;
		}

		if (!databaseCheckpointFailed) {
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
			} catch (ex) {
				// TODO flag context as error / use this.context.error() instead?
				this.context.log?.error(
					`Error writing checkpoint to kafka: ${JSON.stringify(ex)}`,
					{
						messageMetaData: {
							documentId: this.id,
							tenantId: this.tenantId,
						},
					},
				);
				Lumberjack.error(`Error writing checkpoint to the kafka`, lumberjackProperties, ex);
			}
		} else {
			Lumberjack.info(
				`Skipping kafka checkpoint due to database checkpoint failure.`,
				lumberjackProperties,
			);
			databaseCheckpointFailed = false;
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

	public close() {
		this.closed = true;
	}

	private async checkpointCore(
		checkpoint: ICheckpointParams,
		globalCheckpointOnly: boolean = false,
	) {
		// Exit early if already closed
		if (this.closed) {
			return;
		}

		let updateP: Promise<void>;

		const localCheckpointEnabled = this.checkpointService.localCheckpointEnabled;

		// determine if checkpoint is local
		const isLocal =
			globalCheckpointOnly === true
				? false
				: localCheckpointEnabled && checkpoint.reason !== CheckpointReason.NoClients;

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
