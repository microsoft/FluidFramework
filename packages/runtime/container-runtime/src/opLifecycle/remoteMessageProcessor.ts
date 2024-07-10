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
	type InboundSequencedRecentlyAddedContainerRuntimeMessage,
} from "../messageTypes.js";
import { asBatchMetadata } from "../metadata.js";

import { OpDecompressor } from "./opDecompressor.js";
import { OpGroupingManager, isGroupedBatch } from "./opGroupingManager.js";
import { OpSplitter, isChunkedMessage } from "./opSplitter.js";

/** Messages being received as a batch, with details needed to process the batch */
export interface IncomingBatch {
	/** Messages in this batch */
	readonly messages: InboundSequencedContainerRuntimeMessage[];
	/** Batch ID, if present */
	readonly batchId: string | undefined;
	/** clientId that sent this batch. Used to compute Batch ID if needed */
	readonly clientId: string;
	/**
	 * Client Sequence Number of the first message in the batch.
	 * Used to compute Batch ID if needed
	 *
	 * @remarks For chunked batches, this is the CSN of the "representative" chunk (the final chunk).
	 * For grouped batches, clientSequenceNumber on messages is overwritten, so we track this original value here.
	 */
	readonly batchStartCsn: number;
}

function assertHasClientId(
	message: ISequencedDocumentMessage,
): asserts message is ISequencedDocumentMessage & { clientId: string } {
	assert(
		message.clientId !== null,
		"Server-generated message should not reach RemoteMessageProcessor",
	);
}

/**
 * Stateful class for processing incoming remote messages as the virtualization measures are unwrapped,
 * potentially across numerous inbound ops.
 *
 * @internal
 */
export class RemoteMessageProcessor {
	/**
	 * The current batch being received, with details needed to process it.
	 *
	 * @remarks If undefined, we are expecting the next message to start a new batch.
	 */
	private batchInProgress: IncomingBatch | undefined;

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
	public process(remoteMessageCopy: ISequencedDocumentMessage): IncomingBatch | undefined {
		let message = remoteMessageCopy;

		ensureContentsDeserialized(message);

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

		//* TODO (DANIEL): Make sure Grouped Batches get batchId promoted to the top level
		if (isGroupedBatch(message)) {
			// We should be awaiting a new batch (batchStartCsn undefined)
			assert(this.batchInProgress === undefined, "Grouped batch interrupting another batch");
			const batchId = asBatchMetadata(message.metadata)?.batchId;
			return {
				messages: this.opGroupingManager.ungroupOp(message).map(unpack),
				batchStartCsn: message.clientSequenceNumber,
				clientId,
				batchId,
			};
		}

		// Do a final unpack of runtime messages in case the message was not grouped, compressed, or chunked
		unpackRuntimeMessage(message);

		const batchEnd = this.addMessageToBatch(
			message as InboundSequencedContainerRuntimeMessage & { clientId: string },
		);

		if (!batchEnd) {
			// batch not yet complete
			return undefined;
		}

		const completedBatch = this.batchInProgress;
		this.batchInProgress = undefined;
		return completedBatch;
	}

	//* TODO: Review test coverage of batch metadata validation

	/**
	 * Add the given message to the current batch, and indicate whether the batch is now complete.
	 *
	 * @returns true if the batch is now complete, false if more messages are expected
	 */
	private addMessageToBatch(
		message: InboundSequencedContainerRuntimeMessage & { clientId: string },
	): boolean {
		const batchMetadataFlag = asBatchMetadata(message.metadata)?.batch;
		if (this.batchInProgress === undefined) {
			// We are waiting for a new batch
			assert(batchMetadataFlag !== false, "Unexpected batch end marker");

			// Start of a new multi-message batch
			if (batchMetadataFlag === true) {
				this.batchInProgress = {
					messages: [message],
					batchId: asBatchMetadata(message.metadata)?.batchId,
					clientId: message.clientId,
					batchStartCsn: message.clientSequenceNumber,
				};

				return false;
			}

			// Single-message batch (Since metadata flag is undefined)
			this.batchInProgress = {
				messages: [message],
				batchStartCsn: message.clientSequenceNumber,
				clientId: message.clientId,
				batchId: asBatchMetadata(message.metadata)?.batchId,
			};
			return true;
		}
		assert(batchMetadataFlag !== true, "Unexpected batch start marker");

		this.batchInProgress.messages.push(message);

		return batchMetadataFlag === false;
	}
}

/** Takes an incoming message and if the contents is a string, JSON.parse's it in place */
function ensureContentsDeserialized(mutableMessage: ISequencedDocumentMessage): void {
	// back-compat: ADO #1385: eventually should become unconditional, but only for runtime messages!
	// System message may have no contents, or in some cases (mostly for back-compat) they may have actual objects.
	// Old ops may contain empty string (I assume noops).
	if (typeof mutableMessage.contents === "string" && mutableMessage.contents !== "") {
		mutableMessage.contents = JSON.parse(mutableMessage.contents);
	}
}

/**
 * For a given message, it moves the nested InboundContainerRuntimeMessage props one level up.
 *
 * The return type illustrates the assumption that the message param
 * becomes a InboundSequencedContainerRuntimeMessage by the time the function returns
 * (but there is no runtime validation of the 'type' or 'compatDetails' values).
 */
function unpack(message: ISequencedDocumentMessage): InboundSequencedContainerRuntimeMessage {
	// We assume the contents is an InboundContainerRuntimeMessage (the message is "packed")
	const contents = message.contents as InboundContainerRuntimeMessage;

	// We're going to unpack message in-place (promoting those properties of contents up to message itself)
	const messageUnpacked = message as InboundSequencedContainerRuntimeMessage;

	messageUnpacked.type = contents.type;
	messageUnpacked.contents = contents.contents;
	if ("compatDetails" in contents) {
		(messageUnpacked as InboundSequencedRecentlyAddedContainerRuntimeMessage).compatDetails =
			contents.compatDetails;
	}
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
export function unpackRuntimeMessage(message: ISequencedDocumentMessage): boolean {
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
	} else {
		// new format
		unpack(message);
	}

	return true;
}
