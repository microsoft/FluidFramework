/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	extractBoxcar,
	ICollection,
	IContext,
	IQueuedMessage,
	IPartitionLambda,
	IRawOperationMessage,
	IRawOperationMessageBatch,
	isCompleteBoxcarMessage,
} from "@fluidframework/server-services-core";

/**
 * @internal
 */
export class CopierLambda implements IPartitionLambda {
	// Below, one job corresponds to the task of sending one batch to Mongo:
	private pendingJobs = new Map<string, IRawOperationMessageBatch[]>();
	private pendingOffset: IQueuedMessage | undefined;
	private currentJobs = new Map<string, IRawOperationMessageBatch[]>();

	constructor(
		private readonly rawOpCollection: ICollection<any>,
		protected context: IContext,
	) {}

	/**
	 * {@inheritDoc IPartitionLambda.handler}
	 */
	public handler(message: IQueuedMessage): undefined {
		// Extract batch of raw ops from Kafka message:
		const boxcar = extractBoxcar(message);
		if (!isCompleteBoxcarMessage(boxcar)) {
			// If the boxcar is not complete, it cannot be routed correctly.
			return undefined;
		}
		const batch = boxcar.contents;
		const topic = `${boxcar.tenantId}/${boxcar.documentId}`;

		// Extract boxcar contents and group the ops into the message batch:
		const submittedBatch: IRawOperationMessageBatch = {
			index: message.offset,
			documentId: boxcar.documentId,
			tenantId: boxcar.tenantId,
			contents: batch.map((m) => m as IRawOperationMessage),
		};

		// Write the batch directly to Mongo:
		let pendingJobs = this.pendingJobs.get(topic);
		if (!pendingJobs) {
			pendingJobs = [];
			this.pendingJobs.set(topic, pendingJobs);
		}
		pendingJobs.push(submittedBatch);

		// Update current offset (will be tied to this batch):
		this.pendingOffset = message;
		this.sendPending();

		return undefined;
	}

	public close(): void {
		this.pendingJobs.clear();
		this.currentJobs.clear();
	}

	private sendPending(): void {
		// If there is work currently being sent or we have no pending work return early
		if (this.currentJobs.size > 0 || this.pendingJobs.size === 0) {
			return;
		}

		// Swap current and pending
		const temp = this.currentJobs;
		this.currentJobs = this.pendingJobs;
		this.pendingJobs = temp;
		const batchOffset = this.pendingOffset;

		const allProcessed: Promise<void>[] = [];

		// Process all current jobs on all current topics:
		for (const [, batch] of this.currentJobs) {
			const processP = this.processMongoCore(batch);
			allProcessed.push(processP);
		}

		Promise.all(allProcessed)
			.then(() => {
				this.currentJobs.clear();
				this.context.checkpoint(batchOffset as IQueuedMessage);
				this.sendPending();
			})
			.catch((error) => {
				this.context.error(error, { restart: true });
			});
	}

	private async processMongoCore(kafkaBatches: IRawOperationMessageBatch[]): Promise<void> {
		await this.rawOpCollection.insertMany(kafkaBatches, false).catch((error) => {
			// Duplicate key errors are ignored since a replay may cause us to insert twice into Mongo.
			// All other errors result in a rejected promise.
			if (error.code !== 11000) {
				// Needs to be a full rejection here
				throw error;
			}
		});
	}
}
