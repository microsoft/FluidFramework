/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { ICriticalContainerError } from "@fluidframework/container-definitions";
import type { IEvent } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	type ISequencedDocumentMessage,
	MessageType,
} from "@fluidframework/driver-definitions/internal";
import type {
	IdCreationRange,
	IIdCompressor,
	IIdCompressorCore,
} from "@fluidframework/id-compressor/internal";
import type { IRuntimeMessagesContent } from "@fluidframework/runtime-definitions/internal";
import {
	DataCorruptionError,
	extractSafePropertiesFromMessage,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import type { BlobManager } from "../blobManager/index.js";
import type { ChannelCollection } from "../channelCollection.js";
import {
	getSingleUseLegacyLogCallback,
	getUnknownMessageTypeError,
	isUnpackedRuntimeMessage,
// eslint-disable-next-line import/no-deprecated, import/namespace
} from "../containerRuntime.js";
import type { GarbageCollectionMessage, IGarbageCollector } from "../gc/index.js";
import {
	ContainerMessageType,
	type InboundSequencedContainerRuntimeMessage,
} from "../messageTypes.js";
import type { ISavedOpMetadata } from "../metadata.js";
import type { PendingStateManager } from "../pendingStateManager.js";
import type {
	DocumentsSchemaController,
	IDocumentSchemaChangeMessage,
	IDocumentSchemaFeatures,
} from "../summary/index.js";

import type { DuplicateBatchDetector } from "./duplicateBatchDetector.js";
import { ensureContentsDeserialized } from "./opSerialization.js";
import {
	type BatchStartInfo,
	type RemoteMessageProcessor,
} from "./remoteMessageProcessor.js";

interface IInboxEvents extends IEvent {
	(event: "op", listener: () => void);
}

/**
 * ! TODO: remove this interface and put directly on Inbox ctor
 */
export interface IInboxParameters {
	readonly remoteMessageProcessor: RemoteMessageProcessor;
	readonly duplicateBatchDetector: DuplicateBatchDetector | undefined;
	readonly pendingStateManager: PendingStateManager;
	readonly logger: ITelemetryLoggerExt;
	readonly resetReconnectCount: () => void;
	readonly updateDocumentDirtyState: (dirty: boolean) => void;
	readonly hasPendingMessages: () => boolean;
	readonly channelCollection: ChannelCollection;
	readonly garbageCollector: IGarbageCollector;
	readonly blobManager: BlobManager;
	readonly documentsSchemaController: DocumentsSchemaController;
	/**
	 * Id Compressor serializes final state (see getPendingLocalState()). As result, it needs to skip all ops that preceeded that state
	 * (such ops will be marked by Loader layer as savedOp === true)
	 * That said, in "delayed" mode it's possible that Id Compressor was never initialized before getPendingLocalState() is called.
	 * In such case we have to process all ops, including those marked with savedOp === true.
	 */
	readonly skipSavedCompressorOps: boolean;
	readonly getIdCompressor: () => (IIdCompressor & IIdCompressorCore) | undefined;
	readonly getSessionSchema: () => {
		[P in keyof IDocumentSchemaFeatures]?: IDocumentSchemaFeatures[P] extends boolean
			? true
			: IDocumentSchemaFeatures[P];
	};
	readonly closeFn: (error?: ICriticalContainerError) => void;
	readonly usePendingStateMSN: boolean;
	readonly initialSequenceNumbers: {
		snapshotSequenceNumber: number;
		minimumSequenceNumber: number;
		lastProcessedSequenceNumber: number;
	};
}

/**
 * ! TODO: move this to more general package and have container runtime interface implement it
 */
export interface IOpProcessingProperties {
	readonly initialSequenceNumber: number;
	readonly lastProcessedSequenceNumber: number;
	readonly minimumSequenceNumber: number;
	readonly lastKnownSeqNumber: number;
}

export class Inbox extends TypedEventEmitter<IInboxEvents> implements IOpProcessingProperties {
	constructor(private readonly params: IInboxParameters) {
		super();
		this.initialSequenceNumber = params.initialSequenceNumbers.snapshotSequenceNumber;
		this._actualMinimumSequenceNumber = params.initialSequenceNumbers.minimumSequenceNumber;
		this._lastProcessedSequenceNumber =
			params.initialSequenceNumbers.lastProcessedSequenceNumber;
		this._lastKnownSeqNumber = params.initialSequenceNumbers.lastProcessedSequenceNumber;
	}

	// The sequence number we initially loaded from
	// In case of reading from a snapshot or pending state, its value will be equal to
	// the last message that got serialized.
	public readonly initialSequenceNumber: number;

	// * lastProcessedSequenceNumber - last processed sequence number
	private _lastProcessedSequenceNumber: number = 0;
	public get lastProcessedSequenceNumber(): number {
		return this._lastProcessedSequenceNumber;
	}

	// lastProcessedMessage
	private _lastProcessedMessage: ISequencedDocumentMessage | undefined = undefined;
	/**
	 * ! TODO: This property can remain internal to the ContainerRuntime package
	 */
	public get lastProcessedMessage(): ISequencedDocumentMessage | undefined {
		return this._lastProcessedMessage;
	}

	private _actualMinimumSequenceNumber: number = 0;
	public get minimumSequenceNumber(): number {
		const minPendingSeqNum =
			this.params.pendingStateManager.minimumPendingMessageSequenceNumber;
		/**
		 * The reason why the minimum pending sequence number can be less than the delta manager's minimum sequence
		 * number (DM's msn) is that when we are processing messages in the container runtime/delta manager, the delta
		 * manager's msn can be updated to continually increase. In the meantime, the pending state manager's op which
		 * hasn't been sent can still have a lower sequence number than the DM's msn (think about a disconnected
		 * scenario). To successfully resubmit that pending op it has to be rebased first by the DDS. The DDS still
		 * needs to keep the local data for that op that has a reference sequence number lower than the DM's msn. To
		 * achieve this, the msn passed to the DDS needs to be the minimum of the DM's msn and the minimum pending
		 * sequence number, so that it can keep the relevant local data to generate the right data for the new op
		 * during resubmission.
		 */
		if (
			this.params.usePendingStateMSN &&
			minPendingSeqNum !== undefined &&
			minPendingSeqNum < this._actualMinimumSequenceNumber
		) {
			return minPendingSeqNum;
		}
		return this._actualMinimumSequenceNumber;
	}

	// * lastObservedSeqNumber is an estimation of last known sequence number for container in storage. It's initially
	//   populated at web socket connection time (if storage provides that info) and is updated once ops shows up.
	//   It's never less than lastQueuedSequenceNumber
	private _lastKnownSeqNumber: number = 0;
	public get lastKnownSeqNumber(): number {
		return this._lastKnownSeqNumber;
	}

	/**
	 * Implementation of core logic for {@link ContainerRuntime.process}, once preconditions are established
	 *
	 * @param message - Sequenced message for a distributed document. If it's a virtualized batch, we'll process
	 * all messages in the batch here.
	 */
	public processInboundMessageOrBatch(
		message: ISequencedDocumentMessage,
		local: boolean,
	): void {
		this._lastKnownSeqNumber = message.sequenceNumber;

		// Whether or not the message appears to be a runtime message from an up-to-date client.
		// It may be a legacy runtime message (ie already unpacked and ContainerMessageType)
		// or something different, like a system message.
		const hasModernRuntimeMessageEnvelope = message.type === MessageType.Operation;
		const savedOp = (message.metadata as ISavedOpMetadata)?.savedOp;
		const logLegacyCase = getSingleUseLegacyLogCallback(this.params.logger, message.type);

		let runtimeBatch: boolean =
			hasModernRuntimeMessageEnvelope || isUnpackedRuntimeMessage(message);
		if (runtimeBatch) {
			// We expect runtime messages to have JSON contents - deserialize it in place.
			ensureContentsDeserialized(message);
		}

		// this._minimumSequenceNumber = message.minimumSequenceNumber;

		if (hasModernRuntimeMessageEnvelope) {
			// If the message has the modern message envelope, then process it here.
			// Here we unpack the message (decompress, unchunk, and/or ungroup) into a batch of messages with ContainerMessageType
			const inboundResult = this.params.remoteMessageProcessor.process(message, logLegacyCase);
			if (inboundResult === undefined) {
				// This means the incoming message is an incomplete part of a message or batch
				// and we need to process more messages before the rest of the system can understand it.
				return;
			}

			if ("batchStart" in inboundResult) {
				const batchStart: BatchStartInfo = inboundResult.batchStart;
				const result = this.params.duplicateBatchDetector?.processInboundBatch(batchStart);
				if (result?.duplicate) {
					const error = new DataCorruptionError(
						"Duplicate batch - The same batch was sequenced twice",
						{ batchId: batchStart.batchId },
					);

					this.params.logger.sendTelemetryEvent(
						{
							eventName: "DuplicateBatch",
							details: {
								batchId: batchStart.batchId,
								clientId: batchStart.clientId,
								batchStartCsn: batchStart.batchStartCsn,
								size: inboundResult.length,
								duplicateBatchSequenceNumber: result.otherSequenceNumber,
								...extractSafePropertiesFromMessage(batchStart.keyMessage),
							},
						},
						error,
					);
					throw error;
				}
			}

			// Reach out to PendingStateManager, either to zip localOpMetadata into the *local* message list,
			// or to check to ensure the *remote* messages don't match the batchId of a pending local batch.
			// This latter case would indicate that the container has forked - two copies are trying to persist the same local changes.
			let messagesWithPendingState: {
				message: ISequencedDocumentMessage;
				localOpMetadata?: unknown;
			}[] = this.params.pendingStateManager.processInboundMessages(inboundResult, local);

			if (inboundResult.type !== "fullBatch") {
				assert(
					messagesWithPendingState.length === 1,
					0xa3d /* Partial batch should have exactly one message */,
				);
			}

			if (messagesWithPendingState.length === 0) {
				assert(
					inboundResult.type === "fullBatch",
					0xa3e /* Empty batch is always considered a full batch */,
				);
				/**
				 * We need to process an empty batch, which will execute expected actions while processing even if there
				 * are no inner runtime messages.
				 *
				 * Empty batches are produced by the outbox on resubmit when the resubmit flow resulted in no runtime
				 * messages.
				 * This can happen if changes from a remote client "cancel out" the pending changes being resubmitted by
				 * this client.  We submit an empty batch if "offline load" (aka rehydrating from stashed state) is
				 * enabled, to ensure we account for this batch when comparing batchIds, checking for a forked container.
				 * Otherwise, we would not realize this container has forked in the case where it did fork, and a batch
				 * became empty but wasn't submitted as such.
				 */
				messagesWithPendingState = [
					{
						message: inboundResult.batchStart.keyMessage,
						localOpMetadata: undefined,
					},
				];
				// Empty batch message is a non-runtime message as it was generated by the op grouping manager.
				runtimeBatch = false;
			}

			const locationInBatch: { batchStart: boolean; batchEnd: boolean } =
				inboundResult.type === "fullBatch"
					? { batchStart: true, batchEnd: true }
					: inboundResult.type === "batchStartingMessage"
						? { batchStart: true, batchEnd: false }
						: { batchStart: false, batchEnd: inboundResult.batchEnd === true };

			this.processInboundMessages(
				messagesWithPendingState,
				locationInBatch,
				local,
				savedOp,
				runtimeBatch,
				inboundResult.type === "fullBatch"
					? inboundResult.groupedBatch
					: false /* groupedBatch */,
			);
		} else {
			this.processInboundMessages(
				[{ message, localOpMetadata: undefined }],
				{ batchStart: true, batchEnd: true }, // Single message
				local,
				savedOp,
				runtimeBatch,
				false /* groupedBatch */,
			);
		}

		if (local) {
			// If we have processed a local op, this means that the container is
			// making progress and we can reset the counter for how many times
			// we have consecutively replayed the pending states
			this.params.resetReconnectCount();
		}
	}

	public processedClientSequenceNumber: number | undefined;

	/**
	 * Processes inbound message(s). It calls delta scheduler according to the messages' location in the batch.
	 * @param messagesWithMetadata - messages to process along with their metadata.
	 * @param locationInBatch - Are we processing the start and/or end of a batch?
	 * @param local - true if the messages were originally generated by the client receiving it.
	 * @param savedOp - true if the message is a replayed saved op.
	 * @param runtimeBatch - true if these are runtime messages.
	 * @param groupedBatch - true if these messages are part of a grouped op batch.
	 */
	private processInboundMessages(
		messagesWithMetadata: {
			message: ISequencedDocumentMessage;
			localOpMetadata?: unknown;
		}[],
		locationInBatch: { batchStart: boolean; batchEnd: boolean },
		local: boolean,
		savedOp: boolean | undefined,
		runtimeBatch: boolean,
		groupedBatch: boolean,
	): void {
		if (locationInBatch.batchStart) {
			const firstMessage = messagesWithMetadata[0]?.message;
			assert(firstMessage !== undefined, 0xa31 /* Batch must have at least one message */);
			this.emit("batchBegin", firstMessage);
		}

		let error: unknown;
		try {
			if (!runtimeBatch) {
				for (const { message } of messagesWithMetadata) {
					this._actualMinimumSequenceNumber = message.minimumSequenceNumber;
					this.updateLastProcessedMessage(message);
					this.observeNonRuntimeMessage(message);
				}
				return;
			}

			// Updates a message's minimum sequence number to the minimum sequence number that container
			// runtime is tracking and sets processedClientSequenceNumber. It returns the updated message.
			const updateSequenceNumbers = (
				message: ISequencedDocumentMessage,
			): InboundSequencedContainerRuntimeMessage => {
				this._actualMinimumSequenceNumber = message.minimumSequenceNumber;
				// Set the minimum sequence number to the containerRuntime's understanding of minimum sequence number.
				message.minimumSequenceNumber =
					this.params.usePendingStateMSN &&
					this.minimumSequenceNumber < message.minimumSequenceNumber
						? this.minimumSequenceNumber
						: message.minimumSequenceNumber;
				this.processedClientSequenceNumber = message.clientSequenceNumber;
				return message as InboundSequencedContainerRuntimeMessage;
			};

			// Non-grouped batch messages are processed one at a time.
			if (!groupedBatch) {
				for (const { message, localOpMetadata } of messagesWithMetadata) {
					updateSequenceNumbers(message);
					this.updateLastProcessedMessage(message);
					this.validateAndProcessRuntimeMessages(
						message as InboundSequencedContainerRuntimeMessage,
						[
							{
								contents: message.contents,
								localOpMetadata,
								clientSequenceNumber: message.clientSequenceNumber,
							},
						],
						local,
						savedOp,
					);
					this.emit("op", message, true /* runtimeMessage */);
				}
				return;
			}

			let bunchedMessagesContent: IRuntimeMessagesContent[] = [];
			let previousMessage: InboundSequencedContainerRuntimeMessage | undefined;

			// Process the previous bunch of messages.
			const processBunchedMessages = (): void => {
				assert(previousMessage !== undefined, 0xa67 /* previous message must exist */);
				this.updateLastProcessedMessage(previousMessage);
				this.validateAndProcessRuntimeMessages(
					previousMessage,
					bunchedMessagesContent,
					local,
					savedOp,
				);
				bunchedMessagesContent = [];
			};

			/**
			 * For grouped batch messages, bunch contiguous messages of the same type and process them together.
			 * This is an optimization mainly for DDSes, where it can process a bunch of ops together. DDSes
			 * like merge tree or shared tree can process ops more efficiently when they are bunched together.
			 */
			for (const { message, localOpMetadata } of messagesWithMetadata) {
				const currentMessage = updateSequenceNumbers(message);
				if (previousMessage && previousMessage.type !== currentMessage.type) {
					processBunchedMessages();
				}
				previousMessage = currentMessage;
				bunchedMessagesContent.push({
					contents: message.contents,
					localOpMetadata,
					clientSequenceNumber: message.clientSequenceNumber,
				});
			}

			// Process the last bunch of messages.
			processBunchedMessages();

			// Send the "op" events for the messages now that the ops have been processed.
			for (const { message } of messagesWithMetadata) {
				this.emit("op", message, true /* runtimeMessage */);
			}
		} catch (error_) {
			error = error_;
			throw error;
		} finally {
			if (locationInBatch.batchEnd) {
				const lastMessage = messagesWithMetadata[messagesWithMetadata.length - 1]?.message;
				assert(lastMessage !== undefined, 0xa32 /* Batch must have at least one message */);
				this.emit("batchEnd", error, lastMessage);
			}
		}
	}

	/**
	 * Process runtime messages. The messages here are contiguous messages in a batch.
	 * Assuming the messages in the given bunch are also a TypedContainerRuntimeMessage, checks its type and dispatch
	 * the messages to the appropriate handler in the runtime.
	 * Throws a DataProcessingError if the message looks like but doesn't conform to a known TypedContainerRuntimeMessage type.
	 * @param message - The core message with common properties for all the messages.
	 * @param messageContents - The contents, local metadata and clientSequenceNumbers of the messages.
	 * @param local - true if the messages were originally generated by the client receiving it.
	 * @param savedOp - true if the message is a replayed saved op.
	 *
	 */
	private validateAndProcessRuntimeMessages(
		message: Omit<InboundSequencedContainerRuntimeMessage, "contents">,
		messagesContent: IRuntimeMessagesContent[],
		local: boolean,
		savedOp?: boolean,
	): void {
		// If there are no more pending messages after processing a local message,
		// the document is no longer dirty.
		if (!this.params.hasPendingMessages()) {
			this.params.updateDocumentDirtyState(false);
		}

		// Get the contents without the localOpMetadata because not all message types know about localOpMetadata.
		const contents = messagesContent.map((c) => c.contents);

		switch (message.type) {
			case ContainerMessageType.FluidDataStoreOp:
			case ContainerMessageType.Attach:
			case ContainerMessageType.Alias: {
				// Remove the metadata from the message before sending it to the channel collection. The metadata
				// is added by the container runtime and is not part of the message that the channel collection and
				// layers below it expect.
				this.params.channelCollection.processMessages({
					envelope: message,
					messagesContent,
					local,
				});
				break;
			}
			case ContainerMessageType.BlobAttach: {
				this.params.blobManager.processBlobAttachMessage(message, local);
				break;
			}
			case ContainerMessageType.IdAllocation: {
				this.processIdCompressorMessages(contents as IdCreationRange[], savedOp);
				break;
			}
			case ContainerMessageType.GC: {
				this.params.garbageCollector.processMessages(
					contents as GarbageCollectionMessage[],
					message.timestamp,
					local,
				);
				break;
			}
			case ContainerMessageType.ChunkedOp: {
				// From observability POV, we should not expose the rest of the system (including "op" events on object) to these messages.
				// Also resetReconnectCount() would be wrong - see comment that was there before this change was made.
				assert(false, 0x93d /* should not even get here */);
			}
			case ContainerMessageType.Rejoin: {
				break;
			}
			case ContainerMessageType.DocumentSchemaChange: {
				this.params.documentsSchemaController.processDocumentSchemaMessages(
					contents as IDocumentSchemaChangeMessage[],
					local,
					message.sequenceNumber,
				);
				break;
			}
			default: {
				const error = getUnknownMessageTypeError(
					message.type,
					"validateAndProcessRuntimeMessage" /* codePath */,
					message as ISequencedDocumentMessage,
				);
				this.params.closeFn(error);
				throw error;
			}
		}
	}

	/**
	 * Observes messages that are not intended for the runtime layer, updating/notifying Runtime systems as needed.
	 * @param message - non-runtime message to process.
	 */
	private observeNonRuntimeMessage(message: ISequencedDocumentMessage): void {
		this.processedClientSequenceNumber = message.clientSequenceNumber;

		// If there are no more pending messages after processing a local message,
		// the document is no longer dirty.
		if (!this.params.hasPendingMessages()) {
			this.params.updateDocumentDirtyState(false);
		}

		// The DeltaManager used to do this, but doesn't anymore as of Loader v2.4
		// Anyone listening to our "op" event would expect the contents to be parsed per this same logic
		if (
			typeof message.contents === "string" &&
			message.contents !== "" &&
			message.type !== MessageType.ClientLeave
		) {
			message.contents = JSON.parse(message.contents);
		}

		this.emit("op", message, false /* runtimeMessage */);
	}

	// We accumulate Id compressor Ops while Id compressor is not loaded yet (only for "delayed" mode)
	// Once it loads, it will process all such ops and we will stop accumulating further ops - ops will be processes as they come in.
	public pendingIdCompressorOps: IdCreationRange[] = [];

	private processIdCompressorMessages(
		messageContents: IdCreationRange[],
		savedOp?: boolean,
	): void {
		for (const range of messageContents) {
			// Don't re-finalize the range if we're processing a "savedOp" in
			// stashed ops flow. The compressor is stashed with these ops already processed.
			// That said, in idCompressorMode === "delayed", we might not serialize ID compressor, and
			// thus we need to process all the ops.
			if (!(this.params.skipSavedCompressorOps && savedOp === true)) {
				// Some other client turned on the id compressor. If we have not turned it on,
				// put it in a pending queue and delay finalization.
				const idCompressor = this.params.getIdCompressor();
				if (idCompressor === undefined) {
					assert(
						this.params.getSessionSchema().idCompressorMode !== undefined,
						0x93c /* id compressor should be enabled */,
					);
					this.pendingIdCompressorOps.push(range);
				} else {
					assert(
						this.pendingIdCompressorOps.length === 0,
						0x979 /* there should be no pending ops! */,
					);
					idCompressor.finalizeCreationRange(range);
				}
			}
		}
	}

	private updateLastProcessedMessage(message: ISequencedDocumentMessage): void {
		this._lastProcessedSequenceNumber = message.sequenceNumber;
		this._lastProcessedMessage = { ...message };
	}
}
