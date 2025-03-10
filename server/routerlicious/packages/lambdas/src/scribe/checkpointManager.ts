/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	delay,
	ICollection,
	IContext,
	isRetryEnabled,
	IScribe,
	ISequencedOperationMessage,
	runWithRetry,
	IDeltaService,
	IDocumentRepository,
	ICheckpointService,
} from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { ICheckpointManager } from "./interfaces";
import { isLocalCheckpoint } from "./utils";

/**
 * MongoDB specific implementation of ICheckpointManager
 * @internal
 */
export class CheckpointManager implements ICheckpointManager {
	private readonly clientFacadeRetryEnabled: boolean;
	constructor(
		protected readonly context: IContext,
		private readonly tenantId: string,
		private readonly documentId: string,
		private readonly documentRepository: IDocumentRepository,
		private readonly opCollection: ICollection<ISequencedOperationMessage>,
		private readonly deltaService: IDeltaService | undefined,
		private readonly getDeltasViaAlfred: boolean,
		private readonly verifyLastOpPersistence: boolean,
		private readonly checkpointService: ICheckpointService,
	) {
		this.clientFacadeRetryEnabled = isRetryEnabled(this.opCollection);
	}

	/**
	 * Writes the checkpoint information to MongoDB
	 */
	public async write(
		checkpoint: IScribe,
		protocolHead: number,
		pending: ISequencedOperationMessage[],
		noActiveClients: boolean,
		globalCheckpointOnly: boolean,
		markAsCorrupt: boolean = false,
	): Promise<void> {
		const isLocal = isLocalCheckpoint(noActiveClients, globalCheckpointOnly);
		if (this.getDeltasViaAlfred && this.deltaService !== undefined) {
			if (pending.length > 0 && this.verifyLastOpPersistence) {
				// Verify that the last pending op has been persisted to op storage
				// If it is, we can checkpoint
				const expectedSequenceNumber = pending[pending.length - 1].operation.sequenceNumber;
				const lastDelta = await this.deltaService.getDeltas(
					"",
					this.tenantId,
					this.documentId,
					expectedSequenceNumber - 1,
					expectedSequenceNumber + 1,
					"scribe",
				);

				// If we don't get the expected delta, retry after a delay
				if (
					lastDelta.length === 0 ||
					lastDelta[0].sequenceNumber < expectedSequenceNumber
				) {
					const lumberjackProperties = {
						...getLumberBaseProperties(this.documentId, this.tenantId),
						expectedSequenceNumber,
						lastDelta: lastDelta.length > 0 ? lastDelta[0].sequenceNumber : -1,
					};
					Lumberjack.info(
						`Pending ops were not been persisted to op storage. Retrying after delay`,
						lumberjackProperties,
					);
					await delay(1500);
					const lastDelta1 = await this.deltaService.getDeltas(
						"",
						this.tenantId,
						this.documentId,
						expectedSequenceNumber - 1,
						expectedSequenceNumber + 1,
						"scribe",
					);

					if (
						lastDelta1.length === 0 ||
						lastDelta1[0].sequenceNumber < expectedSequenceNumber
					) {
						const errMsg =
							"Pending ops were not been persisted to op storage. Checkpointing failed";
						Lumberjack.error(errMsg, lumberjackProperties);
						throw new Error(errMsg);
					}

					Lumberjack.info(
						`Verified on retry that pending ops are persisted`,
						getLumberBaseProperties(this.documentId, this.tenantId),
					);
				}
			}
			await this.checkpointService.writeCheckpoint(
				this.documentId,
				this.tenantId,
				"scribe",
				checkpoint,
				isLocal,
				markAsCorrupt,
			);
		} else {
			// The order of the three operations below is important.
			// We start by writing out all pending messages to the database. This may be more messages that we would
			// have seen at the current checkpoint we are trying to write (because we continue process messages while
			// waiting to write a checkpoint) but is more efficient and simplifies the code path.
			//
			// We then write the update to the document collection. This marks a log offset inside of MongoDB at which
			// point if Kafka restartes we will not do work prior to this logOffset. At this point the snapshot
			// history has been written, all ops needed are written, and so we can store the final mark.
			//
			// And last we delete all mesages in the list prior to the summaryprotocol sequence number. From now on these
			// will no longer be referenced.
			const dbOps = pending.map((message) => ({
				...message,
				mongoTimestamp: new Date(message.operation.timestamp),
			}));
			if (dbOps.length > 0) {
				await runWithRetry(
					async () => this.opCollection.insertMany(dbOps, false),
					"writeCheckpointScribe",
					3 /* maxRetries */,
					1000 /* retryAfterMs */,
					getLumberBaseProperties(this.documentId, this.tenantId),
					(error) =>
						error.code === 11000 ||
						error.message?.toString()?.indexOf("E11000 duplicate key") >=
							0 /* shouldIgnoreError */,
					(error) => !this.clientFacadeRetryEnabled /* shouldRetry */,
				);
			}

			// Write out the full state first that we require to global & local DB
			await this.checkpointService.writeCheckpoint(
				this.documentId,
				this.tenantId,
				"scribe",
				checkpoint,
				isLocal,
				markAsCorrupt,
			);

			// And then delete messagses that were already summarized.
			await this.opCollection.deleteMany({
				"documentId": this.documentId,
				"operation.sequenceNumber": { $lte: protocolHead },
				"tenantId": this.tenantId,
			});
		}
	}

	/**
	 * Removes the checkpoint information from MongoDB
	 */
	public async delete(sequenceNumber: number, lte: boolean): Promise<void> {
		// Clears the checkpoint information from mongodb.
		await this.documentRepository.updateOne(
			{
				documentId: this.documentId,
				tenantId: this.tenantId,
			},
			{
				scribe: "",
			},
			null,
		);

		// And then delete messagse we no longer will reference
		await this.opCollection.deleteMany({
			"documentId": this.documentId,
			"operation.sequenceNumber": lte ? { $lte: sequenceNumber } : { $gte: sequenceNumber },
			"tenantId": this.tenantId,
		});
	}
}
