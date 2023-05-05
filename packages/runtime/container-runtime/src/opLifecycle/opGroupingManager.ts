/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ContainerRuntimeMessage } from "..";
import { IBatch } from "./definitions";

interface IGroupedMessage {
	contents?: unknown;
	metadata?: Record<string, unknown>;
	compression?: string;
	numEmptyToCreate?: number;
}

export class OpGroupingManager {
	static groupedBatchOp = "groupedBatch";

	constructor(private readonly groupedBatchingEnabled: boolean) {}

	public groupBatch(batch: IBatch, canSimplifyEmptyMessages: boolean = false): IBatch {
		if (batch.content.length < 2 || !this.groupedBatchingEnabled) {
			return batch;
		}

		for (let i = 0; i < batch.content.length; i++) {
			const message = batch.content[i];
			if (message.metadata) {
				const keys = Object.keys(message.metadata);
				assert(keys.length < 2, 0x5dd /* cannot group ops with metadata */);
				assert(
					keys.length === 0 || keys[0] === "batch",
					0x5de /* unexpected op metadata */,
				);
			}
			assert(
				// First message, or cannot simplify, or content is undefined
				i === 0 || !canSimplifyEmptyMessages || message.contents === undefined,
				"trailing messages must have no content",
			);
		}

		const deserializedContent = {
			type: OpGroupingManager.groupedBatchOp,
			contents: [] as IGroupedMessage[],
		};

		if (canSimplifyEmptyMessages) {
			const firstMessage = batch.content[0];
			deserializedContent.contents.push({
				contents:
					firstMessage.contents === undefined
						? undefined
						: JSON.parse(firstMessage.contents),
				metadata: firstMessage.metadata,
				compression: firstMessage.compression,
				// Indicate how many empty message to create upon un-grouping
				numEmptyToCreate: batch.content.length - 1,
			});
		} else {
			deserializedContent.contents = batch.content.map<IGroupedMessage>((message) => ({
				contents: message.contents === undefined ? undefined : JSON.parse(message.contents),
				metadata: message.metadata,
				compression: message.compression,
			}));
		}

		const groupedBatch: IBatch = {
			...batch,
			content: [
				{
					localOpMetadata: undefined,
					metadata: undefined,
					referenceSequenceNumber: batch.content[0].referenceSequenceNumber,
					// Need deserializedContent for back-compat
					deserializedContent: deserializedContent as ContainerRuntimeMessage,
					contents: JSON.stringify(deserializedContent),
				},
			],
		};
		return groupedBatch;
	}

	public ungroupOp(op: ISequencedDocumentMessage): ISequencedDocumentMessage[] {
		if (op.contents?.type !== OpGroupingManager.groupedBatchOp) {
			return [op];
		}

		const messages = op.contents.contents as IGroupedMessage[];
		let fakeCsn = 1;
		const result: ISequencedDocumentMessage[] = messages.map((subMessage) => ({
			...op,
			clientSequenceNumber: fakeCsn++,
			contents: subMessage.contents,
			metadata: subMessage.metadata,
			compression: subMessage.compression,
		}));

		if (messages.length === 1 && messages[0].numEmptyToCreate !== undefined) {
			for (let i = 0; i < messages[0].numEmptyToCreate; i++) {
				result.push({
					...op,
					clientSequenceNumber: fakeCsn++,
					contents: undefined,
					metadata: undefined,
					compression: undefined,
				});
			}
		}

		// Re-add the batch metadata (in case it isn't present)
		if (result.length > 1) {
			result[0].metadata = {
				...result[0].metadata,
				batch: true,
			};
			result[result.length - 1].metadata = {
				...result[result.length - 1].metadata,
				batch: false,
			};
		}

		return result;
	}
}
