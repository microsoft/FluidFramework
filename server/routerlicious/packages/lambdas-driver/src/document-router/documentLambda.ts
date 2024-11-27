/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	extractBoxcar,
	IContext,
	IQueuedMessage,
	IPartitionLambdaConfig,
	IPartitionLambda,
	IPartitionLambdaFactory,
	LambdaCloseType,
	IContextErrorData,
	IDocumentLambdaServerConfiguration,
	IBoxcarMessage,
	INackMessage,
	ISequencedOperationMessage,
	NackOperationType,
	SequencedOperationType,
	SignalOperationType,
	ITicketedSignalMessage,
	RawOperationType,
	IRawOperationMessage,
	isCompleteBoxcarMessage,
} from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { DocumentContextManager } from "./contextManager";
import { DocumentPartition } from "./documentPartition";

export class DocumentLambda implements IPartitionLambda {
	private readonly documents = new Map<string, DocumentPartition>();
	private readonly contextManager: DocumentContextManager;

	private activityCheckTimer: NodeJS.Timeout | undefined;

	private reprocessRange: { startOffset: number | undefined; endOffset: number | undefined } = {
		startOffset: undefined,
		endOffset: undefined,
	};
	private reprocessingOffset: number | undefined;

	constructor(
		private readonly factory: IPartitionLambdaFactory<IPartitionLambdaConfig>,
		private readonly context: IContext,
		private readonly documentLambdaServerConfiguration: IDocumentLambdaServerConfiguration,
	) {
		this.contextManager = new DocumentContextManager(context);
		this.contextManager.on("error", (error, errorData: IContextErrorData) => {
			Lumberjack.verbose(
				"Listening for errors in documentLambda, contextManager error event",
			);
			context.error(error, errorData);
		});
		this.contextManager.on(
			"pause",
			(lowestOffset: number, pausedAtOffset: number, reason?: any) => {
				// Emit pause at the lowest offset out of all document partitions
				// This is important for ensuring that we don't miss any messages
				// And store the reprocessRange so that we can allow contextManager to move back to it when it resumes
				// It will move back to the first offset which was not checkpointed from this range
				this.storeReprocessRange(lowestOffset, pausedAtOffset);
				context.pause(lowestOffset, reason);
			},
		);
		this.contextManager.on("resume", () => {
			context.resume();
		});
		this.activityCheckTimer = setInterval(
			this.inactivityCheck.bind(this),
			documentLambdaServerConfiguration.partitionActivityCheckInterval,
		);
	}

	/**
	 * {@inheritDoc IPartitionLambda.handler}
	 */
	public handler(message: IQueuedMessage): undefined {
		this.reprocessingOffset = this.isOffsetWithinReprocessRange(message.offset)
			? message.offset
			: undefined;
		if (!this.contextManager.setHead(message, this.reprocessingOffset)) {
			this.context.log?.warn(
				"Unexpected head offset. " +
					`head offset: ${this.contextManager.getHeadOffset()}, message offset: ${
						message.offset
					}`,
			);
			// update reprocessRange to avoid reprocessing the same message again
			if (this.reprocessingOffset !== undefined) {
				this.updateReprocessRange(this.reprocessingOffset);
			}
			return undefined;
		}

		this.handlerCore(message);
		this.contextManager.setTail(message, this.reprocessingOffset);

		// update reprocessRange to avoid reprocessing the same message again
		if (this.reprocessingOffset !== undefined) {
			this.updateReprocessRange(this.reprocessingOffset);
		}

		return undefined;
	}

	public close(closeType: LambdaCloseType) {
		if (this.activityCheckTimer !== undefined) {
			clearInterval(this.activityCheckTimer);
			this.activityCheckTimer = undefined;
		}

		this.contextManager.close();

		for (const [, partition] of this.documents) {
			partition.close(closeType);
		}

		this.documents.clear();
	}

	public pause(offset: number): void {
		for (const [, partition] of this.documents) {
			partition.pause(offset);
		}
	}

	public resume(): void {
		for (const [, partition] of this.documents) {
			partition.resume();
		}
	}

	private storeReprocessRange(lowestOffset: number, pausedAtoffset: number) {
		this.reprocessRange = {
			startOffset: lowestOffset,
			endOffset: pausedAtoffset,
		};
	}

	private isOffsetWithinReprocessRange(offset: number) {
		return (
			this.reprocessRange.startOffset !== undefined &&
			this.reprocessRange.endOffset !== undefined &&
			offset >= this.reprocessRange.startOffset &&
			offset <= this.reprocessRange.endOffset
		);
	}

	private updateReprocessRange(reprocessedOffset: number) {
		this.reprocessRange.startOffset = reprocessedOffset + 1;
		if (
			this.reprocessRange.endOffset &&
			this.reprocessRange.endOffset < this.reprocessRange.startOffset
		) {
			// reset since all messages in the reprocess range have been processed
			this.reprocessRange = { startOffset: undefined, endOffset: undefined };
		}
	}

	private handlerCore(message: IQueuedMessage): void {
		const boxcar = extractBoxcar(message);
		if (!isCompleteBoxcarMessage(boxcar)) {
			// If the boxcar is not complete, it cannot be routed correctly.
			return undefined;
		}

		// Stash the parsed value for down stream lambdas
		message.value = boxcar;

		// Create the routing key from tenantId + documentId
		const routingKey = `${boxcar.tenantId}/${boxcar.documentId}`;

		// Create or update the DocumentPartition
		let document = this.documents.get(routingKey);
		if (!document) {
			this.logMessageDetails(boxcar, message, boxcar.documentId, boxcar.tenantId);
			// Create a new context and begin tracking it
			const documentContext = this.contextManager.createContext(boxcar, message);

			document = new DocumentPartition(
				this.factory,
				boxcar.tenantId,
				boxcar.documentId,
				documentContext,
				this.documentLambdaServerConfiguration.partitionActivityTimeout,
			);
			this.documents.set(routingKey, document);
		} else {
			// SetHead assumes it will always receive increasing offsets (except reprocessing during pause/resume). So we need to split the creation case
			// from the update case.
			if (!document.context.setHead(message, this.reprocessingOffset)) {
				return; // if head not updated, it means it doesnt need to be processed, return early
			}
		}

		// Forward the message to the document queue and then resolve the promise to begin processing more messages
		document.process(message);
	}

	private logMessageDetails(
		boxcar: IBoxcarMessage,
		message: IQueuedMessage,
		documentId: string,
		tenantId: string,
	) {
		if (boxcar.contents?.length > 0) {
			const msgOffset = message.offset;
			const msgPartition = message.partition;
			const msgTopic = message.topic;
			const firstOp = boxcar.contents[0];
			let operationType = firstOp.type;
			let sequenceNumber = -1;
			let firstDocMsgType;
			let timestamp;
			const boxcarSize = boxcar.contents.length;

			switch (firstOp.type) {
				case RawOperationType: {
					const rawOperationMessage = firstOp as IRawOperationMessage;
					operationType = rawOperationMessage.type;
					firstDocMsgType = rawOperationMessage.operation.type;
					timestamp = rawOperationMessage.timestamp;
					break;
				}

				case SequencedOperationType: {
					const sequencedOperationMessage = firstOp as ISequencedOperationMessage;
					operationType = sequencedOperationMessage.type;
					firstDocMsgType = sequencedOperationMessage.operation.type;
					sequenceNumber = sequencedOperationMessage.operation.sequenceNumber;
					timestamp = sequencedOperationMessage.operation.timestamp;
					break;
				}

				case NackOperationType: {
					const nackMessage = firstOp as INackMessage;
					operationType = nackMessage.type;
					sequenceNumber = nackMessage.operation.sequenceNumber;
					timestamp = nackMessage.timestamp;
					break;
				}

				case SignalOperationType: {
					const signalMessage = firstOp as ITicketedSignalMessage;
					operationType = signalMessage.type;
					timestamp = signalMessage.timestamp;
				}

				default:
					// ignore unknown types
					break;
			}
			const lumberjackProperties = {
				...getLumberBaseProperties(documentId, tenantId),
				msgOffset,
				msgPartition,
				msgTopic,
				boxcarSize,
				operationType,
				firstOpType: firstDocMsgType,
				sequenceNumber,
				timestamp,
			};
			Lumberjack.info(`Creating new document partition`, lumberjackProperties);
		}
	}

	/**
	 * Closes inactive documents
	 */
	private inactivityCheck() {
		const now = Date.now();

		const documentPartitions = Array.from(this.documents);
		for (const [routingKey, documentPartition] of documentPartitions) {
			if (documentPartition.isInactive(now)) {
				// Close and remove the inactive document
				this.contextManager.removeContext(documentPartition.context);
				documentPartition.close(LambdaCloseType.ActivityTimeout);
				this.documents.delete(routingKey);
			}
		}
	}
}
