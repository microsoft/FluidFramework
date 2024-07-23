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

/**
 * Stateful class for processing incoming remote messages as the virtualization measures are unwrapped,
 * potentially across numerous inbound ops.
 *
 * @internal
 */
export class RemoteMessageProcessor {
	/**
	 * Client Sequence Number of the first message in the current batch being processed.
	 * If undefined, we are expecting the next message to start a new batch.
	 *
	 * @remarks For chunked batches, this is the CSN of the "representative" chunk (the final chunk)
	 */
	private batchStartCsn: number | undefined;
	private readonly processorBatch: InboundSequencedContainerRuntimeMessage[] = [];

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
	):
		| {
				messages: InboundSequencedContainerRuntimeMessage[];
				batchStartCsn: number;
		  }
		| undefined {
		let message = remoteMessageCopy;

		if (isChunkedMessage(message)) {
			const chunkProcessingResult = this.opSplitter.processChunk(message);
			// Only continue further if current chunk is the final chunk
			if (!chunkProcessingResult.isFinalChunk) {
				return;
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
			// We should be awaiting a new batch (batchStartCsn undefined)
			assert(
				this.batchStartCsn === undefined,
				0x9d3 /* Grouped batch interrupting another batch */,
			);
			assert(
				this.processorBatch.length === 0,
				0x9d4 /* Processor batch should be empty on grouped batch */,
			);
			return {
				messages: this.opGroupingManager.ungroupOp(message).map(unpack),
				batchStartCsn: message.clientSequenceNumber,
			};
		}

		const batchStartCsn = this.getAndUpdateBatchStartCsn(message);

		// Do a final unpack of runtime messages in case the message was not grouped, compressed, or chunked
		unpackRuntimeMessage(message, logLegacyCase);
		this.processorBatch.push(message as InboundSequencedContainerRuntimeMessage);

		// this.batchStartCsn is undefined only if we have processed all messages in the batch.
		// If it's still defined, we're still in the middle of a batch, so we return nothing, letting
		// containerRuntime know that we're waiting for more messages to complete the batch.
		if (this.batchStartCsn !== undefined) {
			// batch not yet complete
			return undefined;
		}

		const messages = [...this.processorBatch];
		this.processorBatch.length = 0;
		return {
			messages,
			batchStartCsn,
		};
	}

	/**
	 * Based on pre-existing batch tracking info and the current message's batch metadata,
	 * this will return the starting CSN for this message's batch, and will also update
	 * the batch tracking info (this.batchStartCsn) based on whether we're still mid-batch.
	 */
	private getAndUpdateBatchStartCsn(message: ISequencedDocumentMessage): number {
		const batchMetadataFlag = asBatchMetadata(message.metadata)?.batch;
		if (this.batchStartCsn === undefined) {
			// We are waiting for a new batch
			assert(batchMetadataFlag !== false, 0x9d5 /* Unexpected batch end marker */);

			// Start of a new multi-message batch
			if (batchMetadataFlag === true) {
				this.batchStartCsn = message.clientSequenceNumber;
				return this.batchStartCsn;
			}

			// Single-message batch (Since metadata flag is undefined)
			// IMPORTANT: Leave this.batchStartCsn undefined, we're ready for the next batch now.
			return message.clientSequenceNumber;
		}

		// We are in the middle or end of an existing multi-message batch. Return the current batchStartCsn
		const batchStartCsn = this.batchStartCsn;

		assert(batchMetadataFlag !== true, 0x9d6 /* Unexpected batch start marker */);
		if (batchMetadataFlag === false) {
			// Batch end? Then get ready for the next batch to start
			this.batchStartCsn = undefined;
		}

		return batchStartCsn;
	}
}

/** Takes an incoming message and if the contents is a string, JSON.parse's it in place */
export function ensureContentsDeserialized(
	mutableMessage: ISequencedDocumentMessage,
	modernRuntimeMessage: boolean,
	logLegacyCase: (codePath: string) => void,
): void {
	// back-compat: ADO #1385: eventually should become unconditional, but only for runtime messages!
	// System message may have no contents, or in some cases (mostly for back-compat) they may have actual objects.
	// Old ops may contain empty string (I assume noops).
	let parsedJsonContents: boolean;
	if (typeof mutableMessage.contents === "string" && mutableMessage.contents !== "") {
		mutableMessage.contents = JSON.parse(mutableMessage.contents);
		parsedJsonContents = true;
	} else {
		parsedJsonContents = false;
	}

	// We expect Modern Runtime Messages to have JSON serialized contents,
	// and all other messages not to (system messages and legacy runtime messages without outer "op" type envelope)
	// Let's observe if we are wrong about this to learn about these cases.
	if (modernRuntimeMessage !== parsedJsonContents) {
		logLegacyCase("ensureContentsDeserialized_unexpectedContentsType");
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
