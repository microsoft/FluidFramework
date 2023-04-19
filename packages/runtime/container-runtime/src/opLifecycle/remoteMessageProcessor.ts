/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { ContainerMessageType, ContainerRuntimeMessage } from "../containerRuntime";
import { OpDecompressor } from "./opDecompressor";
import { OpGroupingManager } from "./opGroupingManager";
import { OpSplitter } from "./opSplitter";

export class RemoteMessageProcessor {
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

	public process(remoteMessage: ISequencedDocumentMessage): ISequencedDocumentMessage[] {
		const result: ISequencedDocumentMessage[] = [];

		// Ungroup before processing chunks
		for (let ungroupedMessage of this.opGroupingManager.ungroupOp(copy(remoteMessage))) {
			ungroupedMessage = this.opDecompressor.processMessage(ungroupedMessage).message;
			unpackRuntimeMessage(ungroupedMessage);

			const chunkProcessingResult = this.opSplitter.processRemoteMessage(ungroupedMessage);
			ungroupedMessage = chunkProcessingResult.message;
			if (chunkProcessingResult.state !== "Processed") {
				// If the message is not chunked or if the splitter is still rebuilding the original message,
				// there is no need to continue processing
				result.push(ungroupedMessage);
				continue;
			}

			// Ungroup the chunked message before decompressing
			for (let ungroupedMessageAfterChunking of this.opGroupingManager.ungroupOp(
				ungroupedMessage,
			)) {
				const decompressionAfterChunking = this.opDecompressor.processMessage(
					ungroupedMessageAfterChunking,
				);
				ungroupedMessageAfterChunking = decompressionAfterChunking.message;
				if (decompressionAfterChunking.state === "Skipped") {
					// After chunking, if the original message was not compressed,
					// there is no need to continue processing
					result.push(ungroupedMessageAfterChunking);
					continue;
				}

				// The message needs to be unpacked after chunking + decompression
				unpack(ungroupedMessageAfterChunking);
				result.push(ungroupedMessageAfterChunking);
			}
		}
		return result;
	}
}

const copy = (remoteMessage: ISequencedDocumentMessage): ISequencedDocumentMessage => {
	// Do shallow copy of message, as the processing flow will modify it.
	// There might be multiple container instances receiving same message
	// We do not need to make deep copy, as each layer will just replace message.content itself,
	// but would not modify contents details
	const message = { ...remoteMessage };

	// back-compat: ADO #1385: eventually should become unconditional, but only for runtime messages!
	// System message may have no contents, or in some cases (mostly for back-compat) they may have actual objects.
	// Old ops may contain empty string (I assume noops).
	if (typeof message.contents === "string" && message.contents !== "") {
		message.contents = JSON.parse(message.contents);
	}

	return message;
};

/**
 * For a given message, it moves the nested contents and type on level up.
 *
 */
const unpack = (message: ISequencedDocumentMessage) => {
	const innerContents = message.contents as ContainerRuntimeMessage;
	message.type = innerContents.type;
	message.contents = innerContents.contents;
};

/**
 * Unpacks runtime messages.
 *
 * @remarks This API makes no promises regarding backward-compatibility. This is internal API.
 * @param message - message (as it observed in storage / service)
 * @returns unpacked runtime message
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
	if (message.contents.address !== undefined && message.contents.type === undefined) {
		message.type = ContainerMessageType.FluidDataStoreOp;
	} else {
		// new format
		unpack(message);
	}

	return true;
}
