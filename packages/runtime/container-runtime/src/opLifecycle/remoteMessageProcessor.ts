/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import {
	ContainerMessageType,
	type InboundContainerRuntimeMessage,
	type InboundSequencedContainerRuntimeMessage,
	type InboundSequencedContainerRuntimeMessageOrSystemMessage,
	type InboundSequencedRecentlyAddedContainerRuntimeMessage,
} from "../messageTypes.js";
import { OpDecompressor } from "./opDecompressor.js";
import { OpGroupingManager } from "./opGroupingManager.js";
import { OpSplitter } from "./opSplitter.js";

/**
 * Stateful class for processing incoming remote messages as the virtualization measures are unwrapped,
 * potentially across numerous inbound ops.
 *
 * @internal
 */
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
	 * @param remoteMessageCopy - A shallow copy of a message from another client, possibly virtualized
	 * (grouped, compressed, and/or chunked).
	 * Being a shallow copy, it's considered mutable, meaning no other Container or other parallel procedure
	 * depends on this object instance.
	 * Note remoteMessageCopy.contents (and other object props) MUST not be modified,
	 * but may be overwritten (as is the case with contents).
	 * @returns the unchunked, decompressed, ungrouped, unpacked SequencedContainerRuntimeMessages encapsulated in the remote message.
	 * For ops that weren't virtualized (e.g. System ops that the ContainerRuntime will ultimately ignore),
	 * a singleton array [remoteMessageCopy] is returned
	 */
	public process(
		remoteMessageCopy: ISequencedDocumentMessage,
	): InboundSequencedContainerRuntimeMessageOrSystemMessage[] {
		const result: InboundSequencedContainerRuntimeMessageOrSystemMessage[] = [];

		ensureContentsDeserialized(remoteMessageCopy);

		// Ungroup before and after decompression for back-compat (cleanup tracked by AB#4371)
		for (const ungroupedMessage of this.opGroupingManager.ungroupOp(remoteMessageCopy)) {
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
					result.push(
						ungroupedMessage2 as InboundSequencedContainerRuntimeMessageOrSystemMessage,
					);
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
							result.push(
								ungroupedMessageAfterChunking2 as InboundSequencedContainerRuntimeMessageOrSystemMessage,
							);
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
function unpack(
	message: ISequencedDocumentMessage,
): asserts message is InboundSequencedContainerRuntimeMessage {
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
