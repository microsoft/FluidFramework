/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { DataProcessingError } from "@fluidframework/container-utils";
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

	public process(remoteMessage: ISequencedDocumentMessage): SequencedContainerRuntimeMessage[] {
		const result: SequencedContainerRuntimeMessage[] = [];

		// Ungroup before and after decompression for back-compat (cleanup tracked by AB#4371)
		for (const ungroupedMessage of this.opGroupingManager.ungroupOp(copy(remoteMessage))) {
			const message = this.opDecompressor.processMessage(ungroupedMessage).message;

			for (let ungroupedMessage2 of this.opGroupingManager.ungroupOp(message)) {
				unpackRuntimeMessage(ungroupedMessage2);

				const chunkProcessingResult =
					this.opSplitter.processRemoteMessage(ungroupedMessage2);
				ungroupedMessage2 = chunkProcessingResult.message;
				if (chunkProcessingResult.state !== "Processed") {
					// If the message is not chunked or if the splitter is still rebuilding the original message,
					// there is no need to continue processing
					requireContainerRuntimeMessage(ungroupedMessage2);
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
							requireContainerRuntimeMessage(ungroupedMessageAfterChunking2);
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

function requireContainerRuntimeMessage(message: any): asserts message is ContainerRuntimeMessage {
	const maybeContainerRuntimeMessage = message as ContainerRuntimeMessage;
	switch (maybeContainerRuntimeMessage.type) {
		case ContainerMessageType.Attach:
		case ContainerMessageType.Alias:
		case ContainerMessageType.FluidDataStoreOp:
		case ContainerMessageType.BlobAttach:
		case ContainerMessageType.IdAllocation:
		case ContainerMessageType.ChunkedOp:
		case ContainerMessageType.Rejoin:
			return;
		default: {
			// Type safety on missing known cases
			((_: never) => {})(maybeContainerRuntimeMessage.type);

			const error = DataProcessingError.create(
				// Former assert 0x3ce
				"Runtime message of unknown type",
				"OpProcessing",
				message,
				{
					//* local, // TODO: Do we need this info?  It can be plumbed through
					type: message.type,
					contentType: typeof message.contents,
					batch: message.metadata?.batch,
					compression: message.compression,
				},
			);
			throw error;
		}
	}
}

/**
 * For a given message, it moves the nested contents and type on level up.
 */
function unpack(
	message: ISequencedDocumentMessage,
): asserts message is SequencedContainerRuntimeMessage {
	requireContainerRuntimeMessage(message.contents);
	const innerContainerRuntimeMessage = message.contents;

	message.type = innerContainerRuntimeMessage.type;
	message.contents = innerContainerRuntimeMessage.contents;
}

/**
 * Unpacks runtime messages.
 *
 * @remarks This API makes no promises regarding backward-compatibility. This is internal API.
 * @param message - message (as it observed in storage / service)
 *
 * @internal
 */
export function unpackRuntimeMessage(
	message: ISequencedDocumentMessage,
): asserts message is SequencedContainerRuntimeMessage {
	if (message.type !== MessageType.Operation) {
		// Legacy format, but it's already "unpacked",
		// i.e. message.type is actually ContainerMessageType.
		// Or it's non-runtime message.
		// Nothing to do in such case.

		requireContainerRuntimeMessage(message);
		return;
	}

	// legacy op format?
	if (message.contents.address !== undefined && message.contents.type === undefined) {
		message.type = ContainerMessageType.FluidDataStoreOp;
		return;
	}

	unpack(message);
}
