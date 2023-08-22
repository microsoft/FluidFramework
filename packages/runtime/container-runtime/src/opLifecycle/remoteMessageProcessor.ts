/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import {
	ContainerMessageType,
	ContainerRuntimeMessage,
	SequencedContainerRuntimeMessage,
} from "../containerRuntime";
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

	/**
	 * Ungroups and Unchunks the runtime ops encapsulated by the single remoteMessage received over the wire
	 * @param remoteMessage - A message from another client, likely a chunked/grouped op
	 * @returns the ungrouped, unchunked, unpacked SequencedContainerRuntimeMessage encapsulated in the remote message
	 */
	public process(remoteMessage: ISequencedDocumentMessage): ISequencedDocumentMessage[] {
		const result: ISequencedDocumentMessage[] = [];

		// Ungroup before and after decompression for back-compat (cleanup tracked by AB#4371)
		for (const ungroupedMessage of this.opGroupingManager.ungroupOp(copy(remoteMessage))) {
			const message = this.opDecompressor.processMessage(ungroupedMessage).message;

			for (let ungroupedMessage2 of this.opGroupingManager.ungroupOp(message)) {
				// unpack and unchunk the ungrouped message in place
				unpackRuntimeMessage(ungroupedMessage2);
				const chunkProcessingResult =
					this.opSplitter.processRemoteMessage(ungroupedMessage2);
				ungroupedMessage2 = chunkProcessingResult.message;

				if (chunkProcessingResult.state !== "Processed") {
					// If the message is not chunked or if the splitter is still rebuilding the original message,
					// there is no need to continue processing
					result.push(ungroupedMessage2);
					continue;
				}

				// Ungroup before and after decompression for back-compat (cleanup tracked by AB#4371)
				for (const ungroupedMessageAfterChunking of this.opGroupingManager.ungroupOp(
					ungroupedMessage2,
				)) {
					const decompressionAfterChunking = this.opDecompressor.processMessage(
						ungroupedMessageAfterChunking,
					);

					for (const ungroupedMessageAfterChunking2 of this.opGroupingManager.ungroupOp(
						decompressionAfterChunking.message,
					)) {
						if (decompressionAfterChunking.state === "Skipped") {
							// After chunking, if the original message was not compressed,
							// there is no need to continue processing
							result.push(ungroupedMessageAfterChunking2);
							continue;
						}

						// The message needs to be unpacked after chunking + decompression
						unpack(ungroupedMessageAfterChunking2);
						result.push(ungroupedMessageAfterChunking2);
					}
				}
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
 * For a given message, it moves the nested ContainerRuntimeMessage props one level up.
 *
 * The return type illustrates the assumption that the message param
 * becomes a ContainerRuntimeMessage by the time the function returns
 * (but there is no runtime validation of the 'type' or 'compatDetails' values)
 */
function unpack(
	message: ISequencedDocumentMessage,
): asserts message is SequencedContainerRuntimeMessage {
	const innerContents = message.contents as ContainerRuntimeMessage;

	// We're going to turn message into a SequencedContainerRuntimeMessage in-place
	const sequencedContainerRuntimeMessage = message as SequencedContainerRuntimeMessage;
	sequencedContainerRuntimeMessage.type = innerContents.type;
	sequencedContainerRuntimeMessage.contents = innerContents.contents;
	sequencedContainerRuntimeMessage.compatDetails = innerContents.compatDetails;
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
