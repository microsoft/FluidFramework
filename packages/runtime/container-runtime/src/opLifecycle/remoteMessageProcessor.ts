/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";

import {
	ContainerMessageType,
	type InboundContainerRuntimeMessage,
	type InboundSequencedContainerRuntimeMessage,
} from "../messageTypes.js";
import { asBatchMetadata } from "../metadata.js";

import { OpDecompressor } from "./opDecompressor.js";
import { OpGroupingManager, isGroupedBatch } from "./opGroupingManager.js";
import { OpSplitter, isChunkedMessage } from "./opSplitter.js";
// eslint-disable-next-line unused-imports/no-unused-imports -- Used by "@link" comment annotation below
import { serializeOpContents } from "./outbox.js";

/** Info about the batch we learn when we process the first message */
export interface BatchStartInfo {
	/** Batch ID, if present */
	readonly batchId: string | undefined;
	/** clientId that sent this batch. Used to compute Batch ID if needed */
	readonly clientId: string;
	/**
	 * Client Sequence Number of the Grouped Batch message, or the first message in the ungrouped batch.
	 * Used to compute Batch ID if needed
	 *
	 * @remarks For chunked batches, this is the CSN of the "representative" chunk (the final chunk).
	 * For grouped batches, clientSequenceNumber on messages is overwritten, so we track this original value here.
	 */
	readonly batchStartCsn: number;
	/**
	 * The first message in the batch, or if the batch is empty, the empty grouped batch message.
	 * Used for accessing the sequence numbers for the (start of the) batch.
	 *
	 * @remarks Do not use clientSequenceNumber here, use batchStartCsn instead.
	 */
	readonly keyMessage: ISequencedDocumentMessage;
}

/**
 * Result of processing the next inbound message.
 * Depending on the message and configuration of RemoteMessageProcessor, the result may be:
 * - A full batch of messages (including a single-message batch)
 * - The first message of a multi-message batch
 * - The next message in a multi-message batch
 */
export type InboundMessageResult =
	| {
			type: "fullBatch";
			messages: InboundSequencedContainerRuntimeMessage[];
			batchStart: BatchStartInfo;
			length: number;
			groupedBatch: boolean; // Messages in a grouped batches are sent to the runtime in bunches.
	  }
	| {
			type: "batchStartingMessage";
			batchStart: BatchStartInfo;
			nextMessage: InboundSequencedContainerRuntimeMessage;
			length?: never;
	  }
	| {
			type: "nextBatchMessage";
			batchEnd?: boolean;
			nextMessage: InboundSequencedContainerRuntimeMessage;
			length?: never;
	  };

function assertHasClientId(
	message: ISequencedDocumentMessage,
): asserts message is ISequencedDocumentMessage & { clientId: string } {
	assert(
		message.clientId !== null,
		0xa02 /* Server-generated message should not reach RemoteMessageProcessor */,
	);
}

/**
 * Stateful class for processing incoming remote messages as the virtualization measures are unwrapped,
 * potentially across numerous inbound ops.
 *
 * @internal
 */
export class RemoteMessageProcessor {
	private batchInProgress: boolean = false;

	constructor(
		private readonly opSplitter: OpSplitter,
		private readonly opDecompressor: OpDecompressor,
		private readonly opGroupingManager: OpGroupingManager,
	) {}

	public get partialMessages(): ReadonlyMap<string, string[]> {
		return this.opSplitter.chunks;
	}

	public clearPartialMessagesFor(clientId: string) {
		this.opSplitter.clearPartialChunks(clientId);
	}

	/**
	 * Ungroups and Unchunks the runtime ops of a batch received over the wire
	 * @param remoteMessageCopy - A shallow copy of a message from another client, possibly virtualized
	 * (grouped, compressed, and/or chunked).
	 * Being a shallow copy, it's considered mutable, meaning no other Container or other parallel procedure
	 * depends on this object instance.
	 * Note remoteMessageCopy.contents (and other object props) MUST not be modified,
	 * but may be overwritten (as is the case with contents).
	 *
	 * Incoming messages will always have compression, chunking, and grouped batching happen in a defined order and that order cannot be changed.
	 * When processing these messages, the order is:
	 * 1. If chunked, process the chunk and only continue if this is a final chunk
	 * 2. If compressed, decompress the message and store for further unrolling of the decompressed content
	 * 3. If grouped, ungroup the message
	 * For more details, see https://github.com/microsoft/FluidFramework/blob/main/packages/runtime/container-runtime/src/opLifecycle/README.md#inbound
	 *
	 * @returns all the unchunked, decompressed, ungrouped, unpacked InboundSequencedContainerRuntimeMessage from a single batch
	 * or undefined if the batch is not yet complete.
	 */
	public process(
		remoteMessageCopy: ISequencedDocumentMessage,
		logLegacyCase: (codePath: string) => void,
	): InboundMessageResult | undefined {
		let message = remoteMessageCopy;

		assertHasClientId(message);
		const clientId = message.clientId;

		if (isChunkedMessage(message)) {
			const chunkProcessingResult = this.opSplitter.processChunk(message);
			// Only continue further if current chunk is the final chunk
			if (!chunkProcessingResult.isFinalChunk) {
				return undefined;
			}
			// This message will always be compressed
			message = chunkProcessingResult.message;
		}

		if (this.opDecompressor.isCompressedMessage(message)) {
			this.opDecompressor.decompressAndStore(message);
		}

		if (this.opDecompressor.currentlyUnrolling) {
			message = this.opDecompressor.unroll(message);
			// Need to unpack after unrolling if not a groupedBatch
			if (!isGroupedBatch(message)) {
				unpack(message);
			}
		}

		if (isGroupedBatch(message)) {
			// We should be awaiting a new batch (batchInProgress false)
			assert(!this.batchInProgress, 0x9d3 /* Grouped batch interrupting another batch */);
			const batchId = asBatchMetadata(message.metadata)?.batchId;
			const groupedMessages = this.opGroupingManager.ungroupOp(message).map(unpack);

			return {
				type: "fullBatch",
				messages: groupedMessages, // Will be [] for an empty batch
				batchStart: {
					batchStartCsn: message.clientSequenceNumber,
					clientId,
					batchId,
					keyMessage: groupedMessages[0] ?? message, // For an empty batch, this is the empty grouped batch message. Needed for sequence numbers for this batch
				},
				length: groupedMessages.length, // Will be 0 for an empty batch
				groupedBatch: true,
			};
		}

		// Do a final unpack of runtime messages in case the message was not grouped, compressed, or chunked
		unpackRuntimeMessage(message, logLegacyCase);

		return this.getResultBasedOnBatchMetadata(
			message as InboundSequencedContainerRuntimeMessage & { clientId: string },
		);
	}

	/**
	 * Now that the message has been "unwrapped" as to any virtualization (grouping, compression, chunking),
	 * inspect the batch metadata flag and determine what kind of result to return.
	 */
	private getResultBasedOnBatchMetadata(
		message: InboundSequencedContainerRuntimeMessage & { clientId: string },
	): InboundMessageResult {
		const batchMetadataFlag = asBatchMetadata(message.metadata)?.batch;
		if (!this.batchInProgress) {
			// We are waiting for a new batch
			assert(batchMetadataFlag !== false, 0x9d5 /* Unexpected batch end marker */);

			// Start of a new multi-message batch
			if (batchMetadataFlag === true) {
				this.batchInProgress = true;
				return {
					type: "batchStartingMessage",
					batchStart: {
						batchId: asBatchMetadata(message.metadata)?.batchId,
						clientId: message.clientId,
						batchStartCsn: message.clientSequenceNumber,
						keyMessage: message,
					},
					nextMessage: message,
				};
			}

			// Single-message batch (Since metadata flag is undefined)
			return {
				type: "fullBatch",
				messages: [message],
				batchStart: {
					batchStartCsn: message.clientSequenceNumber,
					clientId: message.clientId,
					batchId: asBatchMetadata(message.metadata)?.batchId,
					keyMessage: message,
				},
				length: 1,
				groupedBatch: false,
			};
		}
		assert(batchMetadataFlag !== true, 0x9d6 /* Unexpected batch start marker */);

		// Clear batchInProgress state if the batch is ending
		if (batchMetadataFlag === false) {
			this.batchInProgress = false;
		}

		return {
			type: "nextBatchMessage",
			nextMessage: message,
			batchEnd: batchMetadataFlag === false,
		};
	}
}

/**
 * Takes an incoming runtime message JSON.parse's its contents in place, if needed (old Loader does this for us).
 * Only to be used for runtine messages.
 * @remarks - Serialization during submit happens via {@link serializeOpContents}
 * @param mutableMessage - op message received
 */
export function ensureContentsDeserialized(mutableMessage: ISequencedDocumentMessage): void {
	// This should become unconditional once Loader LTS reaches 2.4 or later.
	// There will be a long time of needing both cases, until LTS advances to that point.
	if (typeof mutableMessage.contents === "string" && mutableMessage.contents !== "") {
		mutableMessage.contents = JSON.parse(mutableMessage.contents);
	}
}

/**
 * For a given message, it moves the nested InboundContainerRuntimeMessage props one level up.
 *
 * The return type illustrates the assumption that the message param
 * becomes a InboundSequencedContainerRuntimeMessage by the time the function returns
 * (but there is no runtime validation of the 'type').
 */
function unpack(message: ISequencedDocumentMessage): InboundSequencedContainerRuntimeMessage {
	// We assume the contents is an InboundContainerRuntimeMessage (the message is "packed")
	const contents = message.contents as InboundContainerRuntimeMessage;

	// We're going to unpack message in-place (promoting those properties of contents up to message itself)
	const messageUnpacked = message as InboundSequencedContainerRuntimeMessage;

	messageUnpacked.type = contents.type;
	messageUnpacked.contents = contents.contents;
	return messageUnpacked;
}

/**
 * Unpacks runtime messages.
 *
 * @remarks This API makes no promises regarding backward-compatibility. This is internal API.
 * @param message - message (as it observed in storage / service)
 * @returns whether the given message was unpacked
 *
 * @internal
 */
export function unpackRuntimeMessage(
	message: ISequencedDocumentMessage,
	logLegacyCase: (codePath: string) => void = () => {},
): boolean {
	if (message.type !== MessageType.Operation) {
		// Legacy format, but it's already "unpacked",
		// i.e. message.type is actually ContainerMessageType.
		// Or it's non-runtime message.
		// Nothing to do in such case.
		return false;
	}

	// legacy op format?
	// TODO: Unsure if this is a real format we should be concerned with. There doesn't appear to be anything prepared to handle the address member.
	if (
		(message.contents as { address?: unknown }).address !== undefined &&
		(message.contents as { type?: unknown }).type === undefined
	) {
		message.type = ContainerMessageType.FluidDataStoreOp;
		logLegacyCase("unpackRuntimeMessage_contentsWithAddress");
	} else {
		// new format
		unpack(message);
	}

	return true;
}
